import { Logger, ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import helmet from 'helmet';
import { AppModule } from './app.module';
import { AppConfigService } from './config/app-config.service';
import { HttpExceptionFilter } from './common/http-exception.filter';

async function bootstrap(): Promise<void> {
  const logger = new Logger('Bootstrap');
  const app = await NestFactory.create(AppModule);
  const config = app.get(AppConfigService);

  app.use(helmet());
  // CORS restricted to the configured dashboard origin(s) — never a wildcard.
  app.enableCors({ origin: config.allowedOrigins, credentials: true });

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true, // strip unknown properties
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );
  app.useGlobalFilters(new HttpExceptionFilter());

  // OpenAPI docs at /api/docs. No secrets are surfaced — env config is never
  // part of any DTO or response schema.
  const swaggerConfig = new DocumentBuilder()
    .setTitle('Settlement Rail API')
    .setDescription(
      'Clearing-to-chain USDC settlement on Ethereum Sepolia: submit instructions, ' +
        'track confirmations, inspect the double-entry ledger, and reconcile.',
    )
    .setVersion('1.0')
    .build();
  const document = SwaggerModule.createDocument(app, swaggerConfig);
  // Load the Swagger UI assets from a CDN. On serverless hosts (Vercel) the
  // bundled swagger-ui-dist static files aren't served, which leaves a blank
  // page; the CDN URLs make the docs render anywhere.
  SwaggerModule.setup('api/docs', app, document, {
    customCssUrl:
      'https://cdn.jsdelivr.net/npm/swagger-ui-dist@5/swagger-ui.css',
    customJs: [
      'https://cdn.jsdelivr.net/npm/swagger-ui-dist@5/swagger-ui-bundle.js',
      'https://cdn.jsdelivr.net/npm/swagger-ui-dist@5/swagger-ui-standalone-preset.js',
    ],
  });

  // Graceful shutdown: triggers OnModuleDestroy across modules (relayer drain,
  // WSS close, Prisma disconnect).
  app.enableShutdownHooks();

  await app.listen(config.port);
  logger.log(`Settlement rail listening on :${config.port}`);
  logger.log(`Swagger docs at http://localhost:${config.port}/api/docs`);
  logger.log(`CORS allowed origins: ${config.allowedOrigins.join(', ')}`);
}

void bootstrap();
