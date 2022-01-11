import { createContext, ContextStack, MiidError, compose, ContextProvider } from '../src/mod';

type MaybeAsync<T> = T | Promise<T>;

describe('ContextStack', () => {
  test('ContextStack.createEmpty', () => {
    expect(ContextStack.createEmpty()).toBeInstanceOf(ContextStack);
  });

  test(`Creating a ContextStack with a provider but no parent throws`, () => {
    const Ctx = createContext<string>({ name: 'Ctx' });
    expect(() => new (ContextStack as any)(Ctx.Provider(''))).toThrow();
  });

  test(`Context with 0 should return self`, () => {
    const Ctx = createContext<string>({ name: 'Ctx' });
    const ctx = ContextStack.createEmpty().with(Ctx.Provider(''));
    expect(ctx.with()).toBe(ctx);
  });

  test('Context with default', () => {
    const CtxWithDefault = createContext<string>({
      name: 'CtxWithDefault',
      defaultValue: 'DEFAULT',
    });
    const emptyCtx = ContextStack.createEmpty();
    expect(emptyCtx.get(CtxWithDefault.Consumer)).toBe('DEFAULT');
    expect(emptyCtx.getOrFail(CtxWithDefault.Consumer)).toBe('DEFAULT');
    expect(emptyCtx.has(CtxWithDefault.Consumer)).toBe(false);
    const ctx = emptyCtx.with(CtxWithDefault.Provider('A'));
    expect(ctx.get(CtxWithDefault.Consumer)).toBe('A');
    expect(ctx.getOrFail(CtxWithDefault.Consumer)).toBe('A');
    expect(ctx.has(CtxWithDefault.Consumer)).toBe(true);
    const OtherCtx = createContext<string>({ name: 'OtherCtx' });
    const otherCtx = emptyCtx.with(OtherCtx.Provider('other'));
    expect(otherCtx.get(CtxWithDefault.Consumer)).toBe('DEFAULT');
    expect(otherCtx.getOrFail(CtxWithDefault.Consumer)).toBe('DEFAULT');
    expect(otherCtx.has(CtxWithDefault.Consumer)).toBe(false);
  });

  test('Context without default', () => {
    const CtxNoDefault = createContext<string>({ name: 'CtxNoDefault' });
    const emptyCtx = ContextStack.createEmpty();
    expect(emptyCtx.get(CtxNoDefault.Consumer)).toBe(null);
    expect(() => emptyCtx.getOrFail(CtxNoDefault.Consumer)).toThrow();
    expect(emptyCtx.has(CtxNoDefault.Consumer)).toBe(false);
    const ctx = emptyCtx.with(CtxNoDefault.Provider('A'));
    expect(ctx.get(CtxNoDefault.Consumer)).toBe('A');
    expect(ctx.getOrFail(CtxNoDefault.Consumer)).toBe('A');
    expect(ctx.has(CtxNoDefault.Consumer)).toBe(true);
  });

  test('Custom ContextStack', () => {
    class CustomContext extends ContextStack {
      // You need to override createEmpty otherwise it will create ContextStack
      static createEmpty(): CustomContext {
        return new CustomContext();
      }

      // Make the constructor protected because it should not be accessible from outside
      // It's important to keep the same argument as the original ContextStack, otherwise the `with()` method won't work
      protected constructor(provider?: ContextProvider<any>, parent?: CustomContext) {
        super(provider, parent);
      }
    }

    const custom = CustomContext.createEmpty();
    expect(custom instanceof CustomContext).toBe(true);
    expect(custom instanceof ContextStack).toBe(true);
    const Ctx = createContext<string>({ name: 'Ctx' });
    const next = custom.with(Ctx.Provider('ok'));
    expect(next instanceof CustomContext).toBe(true);
    expect(next instanceof ContextStack).toBe(true);
  });
});

test('compose', async () => {
  const ACtx = createContext<string>({ name: 'ACtx', defaultValue: 'A' });

  const mock = jest.fn();

  const mid = compose<ContextStack, MaybeAsync<string>>(
    (ctx, next) => {
      mock('middleware 1');
      return next(ctx.with(ACtx.Provider('a1')));
    },
    (ctx, next) => {
      mock('middleware 2');
      return next(ctx.with(ACtx.Provider('a2')));
    },
    (ctx, next) => {
      mock('middleware 3');
      mock(ctx.get(ACtx.Consumer));
      return next(ctx.with(ACtx.Provider('a3')));
    }
  );

  const mid2 = compose(mid, async (ctx, next) => {
    mock('done');
    return next(ctx);
  });

  const mid3 = compose(mid2, async (ctx, next) => {
    const tmp = await Promise.resolve(next(ctx));
    mock('tmp ' + tmp);
    return tmp;
  });

  const res = await mid3(ContextStack.createEmpty(), () => {
    mock('done 2');
    return 'nope2';
  });

  expect(mock.mock.calls).toEqual([
    ['middleware 1'],
    ['middleware 2'],
    ['middleware 3'],
    ['a2'],
    ['done'],
    ['done 2'],
    ['tmp nope2'],
  ]);
  expect(res).toBe('nope2');
});

test('create empty stack', () => {
  expect(ContextStack.createEmpty()).toBeInstanceOf(ContextStack);
});

test('Compose should throw on invalid middleware type', () => {
  expect(() => compose({} as any)).toThrow(MiidError.InvalidMiddleware);
});

test('Debug context', () => {
  const ACtx = createContext<string>({ name: 'ACtx', defaultValue: 'A' });
  const BCtx = createContext<string>({ name: 'BCtx', defaultValue: 'B' });
  const ctx = ContextStack.createEmpty().with(
    ACtx.Provider('a1'),
    BCtx.Provider('b1'),
    ACtx.Provider('a2')
  );
  expect(ctx.debug()).toMatchObject([{ value: 'a1' }, { value: 'b1' }, { value: 'a2' }]);
});

test('compile README example', () => {
  const originalLog = console.log;
  console.log = jest.fn();

  const ACtx = createContext<string>({ name: 'ACtx', defaultValue: 'A' });

  const mid = compose<ContextStack, string>(
    (ctx, next) => {
      console.log('middleware 1');
      console.log(ctx.debug());
      return next(ctx.with(ACtx.Provider('a1')));
    },
    (ctx, next) => {
      console.log('middleware 2');
      console.log(ctx.debug());
      return next(ctx.with(ACtx.Provider('a2')));
    },
    (ctx, next) => {
      console.log('middleware 3');
      console.log(ctx.get(ACtx.Consumer));
      console.log(ctx.debug());
      return next(ctx.with(ACtx.Provider('a3')));
    }
  );
  const mid2 = compose(mid, (ctx, next) => {
    console.log('done');
    console.log(ctx.debug());
    return next(ctx);
  });
  mid2(ContextStack.createEmpty(), () => {
    console.log('done 2');
    return 'nope2';
  });

  console.log = originalLog;
});
