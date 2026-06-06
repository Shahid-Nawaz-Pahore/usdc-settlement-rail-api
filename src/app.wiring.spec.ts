import { Test } from '@nestjs/testing';
import { AppModule } from './app.module';

// Proves the whole DI graph resolves (no missing providers / cycles) and that
// every provider constructs without error. compile() instantiates providers but
// does NOT run onModuleInit/onApplicationBootstrap, so no DB or RPC connection
// is attempted — env comes from test/jest-setup-env.ts.
describe('AppModule wiring', () => {
  it('resolves the dependency graph', async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    expect(moduleRef).toBeDefined();
    await moduleRef.close();
  });
});
