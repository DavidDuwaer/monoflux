export class Flux<T> implements AsyncGenerator<T>, Promise<T[]> {
    private readonly generator: AsyncGenerator<T>
    private readonly upstream?: Flux<unknown>
    private readonly handleCancel?: (e?: any) => void
    private _closed = false

    private constructor(
        generator: AsyncGenerator<T>,
        upstream: Flux<unknown> | undefined,
        handleCancel?: (e?: any) => void
    ) {
        const thiss = this
        this.generator = (async function* gen() {
            try {
                yield* generator
            } catch (e) {
                yield ignorableValue as any
                throw e
            } finally {
                thiss._closed = true
            }
        })()
        this.upstream = upstream
        this.handleCancel = handleCancel
    }

    //// Start AsyncGenerator methods ////

    [Symbol.asyncIterator](): AsyncGenerator<T, any, unknown> {
        return this
    }

    async next(...args: [] | [unknown]): Promise<IteratorResult<T>>
    async next(...args: [] | [unknown]): Promise<IteratorResult<T>>
    async next(...args: [] | [unknown]): Promise<IteratorResult<T>> {
        const value = await this.generator.next(args)
        return value.value !== ignorableValue
            ? value
            : await this.next(args)
    }

    return(value?: any): Promise<IteratorResult<T, undefined>> {
        return this.generator.return(value)
    }

    throw(e: any): Promise<IteratorResult<T>> {
        return this.generator.throw(e)
    }

    async cancel(e?: unknown): Promise<void> {
        if (this.closed) {
            return
        }
        if (this.upstream !== undefined) {
            return this.upstream.cancel(e)
        } else {
            if (this.handleCancel !== undefined) {
                this.handleCancel(e)
            } else {
                await this.throw(e)
            }
        }
    }

    //// End AsyncGenerator methods ////

    //// Start Promise methods ////

    async then<TResult1 = T[], TResult2 = never>(
        onfulfilled?: ((value: T[]) => TResult1 | PromiseLike<TResult1>) | null,
        onrejected?: ((reason: any) => TResult2 | PromiseLike<TResult2>) | null
    ): Promise<TResult1 | TResult2> {
        try {
            const result = await this.asList()
            return onfulfilled !== undefined && onfulfilled !== null
                ? await onfulfilled(result)
                : (result as unknown as TResult1)
        } catch (e) {
            if (onrejected !== undefined && onrejected !== null) {
                return onrejected(e)
            } else {
                throw e
            }
        }
    }

    async catch<TResult = never>(
        onrejected?: ((reason: any) => TResult | PromiseLike<TResult>) | null
    ): Promise<T[] | TResult> {
        try {
            return this.asList()
        } catch (e) {
            if (onrejected !== undefined && onrejected !== null) {
                return onrejected(e)
            } else {
                throw e
            }
        }
    }

    async finally(onfinally?: (() => void) | null): Promise<T[]> {
        const promise = await this.asList()
        onfinally?.()
        return promise
    }

    get [Symbol.toStringTag](): string {
        return 'Flux'
    }

    //// End Promise methods ////

    subscribe(callback?: (value: T) => void) {
        const flux = callback !== undefined
            ? this.doOnEach(callback)
            : this
        const recur = () => {
            flux
                .next()
                .then(value => {
                    if (!value.done) {
                        recur()
                    }
                })
                .catch(err => {
                    console.error(err)
                })
        }
        recur()
        return {
            unsubscribe: () => this.return()
        }
    }

    filter<O = T>(predicate: (value: T) => boolean): Flux<O> {
        const thiss = this
        return Flux.constructFromGeneratorFunction<T>(
            async function* gen() {
                for await (const value of thiss) {
                    if (predicate(value)) {
                        yield value
                    }
                }
            },
            this
        ) as unknown as Flux<O>
    }

    /**
     * Flux until predicate is true; the rest is dropped. The first
     * value that is dropped is the value for which the predicate
     * is true.
     *
     * @param predicate
     */
    untilExcl(predicate: (value: T) => boolean) {
        const thiss = this
        return Flux.constructFromGeneratorFunction(
            async function* gen() {
                for await (const value of thiss) {
                    if (predicate(value)) {
                        break
                    }
                    yield value
                }
            },
            this
        )
    }

    doOnEach(callback: (value: T) => void): Flux<T> {
        const thiss = this
        return Flux.constructFromGeneratorFunction(
            async function* gen() {
                for await (const value of thiss) {
                    callback(value)
                    yield value
                }
            },
            this
        )
    }

    doAfterLast(callback: (allEvents: T[]) => (void | Promise<void>)): Flux<T> {
        const thiss = this
        const events: T[] = []
        return Flux.constructFromGeneratorFunction(
            async function* gen() {
                for await (const value of thiss) {
                    events.push(value)
                    yield value
                }
                await callback(events)
            },
            this
        )
    }

    map<O>(mapper: (value: T) => O): Flux<O> {
        const thiss = this
        return Flux.constructFromGeneratorFunction(
            async function* gen() {
                for await (const value of thiss) {
                    yield mapper(value)
                }
            },
            this
        )
    }

    take(n: number): Flux<T> {
        const thiss = this
        return Flux.constructFromGeneratorFunction(
            async function* gen() {
                let i = 0
                for await (const value of thiss) {
                    if (i >= n) {
                        thiss.cancel()
                        break
                    }
                    i++
                    yield value
                }
            },
            this
        )
    }

    flatMap<O>(mapper: (value: T) => O[]): Flux<O>
    flatMap<O>(mapper: (value: T) => Promise<O>): Flux<O>
    flatMap<O>(mapper: (value: T) => (Promise<O> | O[])): Flux<O> {
        const thiss = this
        return Flux.constructFromGeneratorFunction(
            async function* gen() {
                const pendingPromises: Promise<O>[] = []
                const resolvedValues: O[] = []
                const resolvedIndexes = new Set<number>()
                let yieldedUpTo = 0

                // Process all input values and start their async operations
                for await (const value of thiss) {
                    const result = mapper(value)

                    if (Array.isArray(result)) {
                        // Synchronous array results can be yielded immediately
                        for (const r of result) {
                            yield r
                        }
                    } else {
                        // Start the promise and track it
                        const promiseIndex = pendingPromises.length
                        pendingPromises.push(result)

                        // Mark when this promise resolves
                        result.then(resolved => {
                            resolvedValues[promiseIndex] = resolved
                            resolvedIndexes.add(promiseIndex)
                        }).catch(() => {
                            // Mark as resolved even on error to not block the sequence
                            resolvedIndexes.add(promiseIndex)
                        })
                    }
                }

                // Yield results in order as they become available
                while (yieldedUpTo < pendingPromises.length) {
                    if (resolvedIndexes.has(yieldedUpTo)) {
                        // This promise has resolved, yield its value
                        if (resolvedValues[yieldedUpTo] !== undefined) {
                            yield resolvedValues[yieldedUpTo]
                        }
                        yieldedUpTo++
                    } else {
                        // Wait for the next promise in sequence to resolve
                        try {
                            yield await pendingPromises[yieldedUpTo]
                        } catch (e) {
                            // Skip failed promises
                        }
                        yieldedUpTo++
                    }
                }
            },
            this
        )
    }

    transform<O>(defineGenerator: (thisFlux: Flux<T>) => AsyncGenerator<O>) {
        const definedGenerator = defineGenerator(this)
        return Flux.constructFromGeneratorFunction<O>(
            async function* gen() {
                for await (const value of definedGenerator) {
                    yield value
                }
            },
            this
        )
    }

    async reduce<O>(initialValue: O, reducer: (reduction: O, newValue: T) => O): Promise<O>
    async reduce<O>(reducer: (reduction: O | undefined, newValue: T) => O): Promise<O | undefined>
    async reduce<O>(reducer: (reduction: O | undefined, newValue: T) => O, initialValue?: O): Promise<O | undefined> {
        let reduction = initialValue
        for await (const value of this) {
            reduction = reducer(reduction, value)
        }
        return reduction
    }

    async asList(): Promise<T[]> {
        const result: T[] = []
        for await (const value of this) {
            result.push(value)
        }
        return result
    }

    async whenComplete(): Promise<void> {
        for await (const ignored of this) {
            // do nothing
        }
    }

    static create<T>(
      creator: (push: (value: T) => void, complete: () => void, reject: (err: any) => void) => (void | Promise<void>)
    ) {
        const values: T[] = [];
        const resolvers: {resolve: (iteratorResult: IteratorResult<T>) => void, reject: (reason?: any) => void}[] = [];
        let isDone = false;
        let error: {value: any} | undefined = undefined

        const push = (value: T) => {
            if (isDone) {
                throw new Error("Cannot push to a completed generator");
            }

            if (resolvers.length > 0) {
                const resolve = resolvers.shift()!;
                resolve.resolve({done: false, value});
            } else {
                values.push(value);
            }
        }

        const complete = () => {
            isDone = true;
            while (resolvers.length > 0) {
                const resolve = resolvers.shift()!;
                resolve.resolve({done: true, value: undefined});
            }
        }

        const reject = (err: any) => {
            error = {value: err}
            // Wake up next resolver to propagate the error
            resolvers.shift()?.reject(err); // This will make the `.next()` promise reject with the error
        }

        (async () => {
            try {
                await creator(
                  push,
                  complete,
                  reject,
                )
                if (!isDone || error === undefined) {
                    complete()
                }
            } catch (err) {
                reject(err)
            }
        })()

        return Flux.fromGenerator<T>({
            [Symbol.asyncIterator]() {
                return this
            },

            next(...args) {
                if (error) {
                    const err = error.value
                    error = undefined
                    return Promise.reject(err)
                }

                if (values.length > 0) {
                    const value = values.shift()!;
                    return Promise.resolve<IteratorResult<T, any>>({done: false, value})
                }

                if (isDone) {
                    return Promise.resolve<IteratorResult<T>>({done: true, value: undefined})
                }

                return new Promise<IteratorResult<T>>((resolve, reject) => {
                    resolvers.push({resolve, reject})
                });
            },

            return() {
                complete();
                return Promise.resolve({done: true, value: undefined})
            },

            throw(err) {
                reject(err)
                return Promise.reject(err)
            },

        });
    }

    static just<T>(...array: T[]): Flux<T> {
        return Flux.from(array)
    }

    static from<T>(array: T[]): Flux<T>
    static from<T>(generator: AsyncGenerator<T>, handleCancel?: (e?: any) => void): Flux<T>
    static from<T>(stream: ReadableStream<T>, handleCancel?: (e?: any) => void): Flux<T>
    static from<T>(fn: () => AsyncGenerator<T>, handleCancel?: (e?: any) => void): Flux<T>
    static from<T>(
        source: T[] | AsyncGenerator<T> | ReadableStream<T> | (() => AsyncGenerator<T>),
        handleCancel?: (e?: any) => void
    ): Flux<T> {
        if (Array.isArray(source)) {
            return Flux.fromArray(source)
        } else if (typeof source === 'function') {
            return Flux.fromGeneratorFunction(source, handleCancel)
        } else if (source instanceof ReadableStream) {
            return Flux.fromReadableStream(source, handleCancel)
        } else if (isGenerator(source)) {
            return Flux.fromGenerator(source, handleCancel)
        } else {
            throw new TypeError('Source must be an Array, AsyncGenerator, ReadableStream, or a generator function')
        }
    }

    static fromArray<T>(array: T[]): Flux<T> {
        return Flux.fromGeneratorFunction<T>(async function* gen() {
            for (const value of array) {
                yield value
            }
        })
    }

    static constructFromGeneratorFunction<T>(
        fn: () => AsyncGenerator<T>,
        upstream: Flux<unknown> | undefined,
        handleCancel?: (e?: any) => void
    ) {
        return new Flux<T>(
            fn(),
            upstream,
            handleCancel
        )
    }

    static fromGeneratorFunction<T>(
        fn: () => AsyncGenerator<T>,
        handleCancel?: (e?: any) => void
    ) {
        return Flux.constructFromGeneratorFunction(
            fn,
            undefined,
            handleCancel
        )
    }

    static fromGenerator<T>(
        generator: AsyncGenerator<T>,
        handleCancel?: (e?: any) => void
    ) {
        return new Flux<T>(generator, undefined, handleCancel);
    }

    static fromReadableStream<T>(
        stream: ReadableStream<T>,
        handleCancel?: (e?: any) => void
    ): Flux<T> {
        return Flux.fromGeneratorFunction(
            async function* gen() {
                const reader = stream.getReader()
                try {
                    let excerpt: Awaited<(ReturnType<(typeof reader)['read']>)> | undefined = undefined
                    while (!(excerpt = await reader.read()).done) {
                        yield excerpt.value
                    }
                } finally {
                    await reader.cancel()
                }
            },
            handleCancel
        )
    }

    public get closed() {
        return this._closed
    }
}

function isGenerator<T>(obj: any): obj is AsyncGenerator<T> {
    return obj !== null &&
        typeof obj === 'object' &&
        typeof obj.next === 'function' &&
        typeof obj.return === 'function' &&
        typeof obj.throw === 'function' &&
        Symbol.asyncIterator in obj
}

const ignorableValue = {}