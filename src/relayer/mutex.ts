/**
 * Minimal async mutex. Used to serialise every broadcast from the operator
 * wallet so new sends and gas-bump resends can never interleave and corrupt the
 * nonce sequence — only one transaction is ever in the air at a time.
 */
export class Mutex {
  private tail: Promise<void> = Promise.resolve();

  runExclusive<T>(fn: () => Promise<T>): Promise<T> {
    const run = this.tail.then(fn, fn);
    // Keep the chain alive regardless of success/failure of fn.
    this.tail = run.then(
      () => undefined,
      () => undefined,
    );
    return run;
  }
}
