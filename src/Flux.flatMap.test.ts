import { Flux } from './Flux'
import { expect } from 'chai'
import { Instant } from "globol"
import { sleep } from './util/sleep'

describe('Flux.flatMap', () => {
    describe('with Array mapper', () => {
        it('should flatten array results from mapper function', async () => {
            const flux = Flux.fromArray([1, 2, 3])

            const result = flux.flatMap((value) => [value * 10, value * 10 + 1])

            const list = await result.asList()
            expect(list).to.deep.equal([10, 11, 20, 21, 30, 31])
        })

        it('should handle empty array results', async () => {
            const flux = Flux.fromArray([1, 2, 3])

            const result = flux.flatMap((value) =>
                value === 2 ? [value] : []
            )

            const list = await result.asList()
            expect(list).to.deep.equal([2])
        })

        it('should handle mixed empty and non-empty arrays', async () => {
            const flux = Flux.fromArray([1, 2, 3, 4])

            const result = flux.flatMap((value) => {
                if (value % 2 === 0) {
                    return [value, value + 10]
                } else {
                    return []
                }
            })

            const list = await result.asList()
            expect(list).to.deep.equal([2, 12, 4, 14])
        })

        it('should handle large arrays efficiently', async () => {
            const flux = Flux.fromArray([1, 2, 3])

            const result = flux.flatMap((value) =>
                Array.from({ length: value }, (_, i) => value * 100 + i)
            )

            const list = await result.asList()
            expect(list).to.deep.equal([100, 200, 201, 300, 301, 302])
        })
    })

    describe('with Promise mapper', () => {
        it('should execute callbacks in parallel, not sequentially', async () => {
            const executionOrder: string[] = []

            // Create a flux with multiple items
            const flux = Flux.fromArray([1, 2, 3])

            // Use flatMap with async callbacks that have different delays
            const result = flux.flatMap(async (value) => {
                executionOrder.push(`start-${value}`)

                // Different delays to test parallel execution
                const delay = value === 1 ? 300 : value === 2 ? 100 : 200
                await new Promise(resolve => setTimeout(resolve, delay))

                executionOrder.push(`end-${value}`)
                return value * 10
            })

            // Collect all results
            await result.asList()

            // If callbacks run in parallel:
            // - All items should start before any completes
            // - Item 2 (shortest delay) should complete first
            // - Item 3 should complete second
            // - Item 1 (longest delay) should complete last

            // Verify all started before any completed
            const firstEndIndex = executionOrder.findIndex(event => event.startsWith('end-'))
            const allStartEvents = executionOrder.filter(event => event.startsWith('start-'))

            expect(allStartEvents.length).to.equal(3)
            expect(firstEndIndex).to.be.at.least(3) // All 3 starts should happen before first end

            // Verify completion order based on delays
            expect(executionOrder.indexOf('end-2')).to.be.lessThan(executionOrder.indexOf('end-3'))
            expect(executionOrder.indexOf('end-3')).to.be.lessThan(executionOrder.indexOf('end-1'))
        })

        it('should respect concurrency limit for Promise callbacks', async () => {
            const executionOrder: string[] = []
            let currentlyRunning = 0
            let maxConcurrentlyRunning = 0

            const flux = Flux.fromArray([1, 2, 3, 4, 5])

            const result = flux.flatMap(async (value) => {
                currentlyRunning++
                maxConcurrentlyRunning = Math.max(maxConcurrentlyRunning, currentlyRunning)
                executionOrder.push(`start-${value} (running: ${currentlyRunning})`)

                // All have same delay to test concurrency limiting
                await new Promise(resolve => setTimeout(resolve, 50))

                currentlyRunning--
                executionOrder.push(`end-${value}`)
                return value * 10
            }, { concurrency: 2 })

            await result.asList()

            // With concurrency=2, max 2 should run concurrently
            expect(maxConcurrentlyRunning).to.equal(2)

            // Verify we never exceeded the limit
            for (const event of executionOrder) {
                if (event.includes('running:')) {
                    const runningCount = parseInt(event.match(/running: (\d+)/)?.[1] || '0')
                    expect(runningCount).to.be.at.most(2)
                }
            }
        })

        it('should process new emissions while previous async callback is still running', async () => {
            const executionOrder: string[] = []

            // Create a flux that emits asynchronously
            const sourceFlux = Flux.fromGeneratorFunction(async function* () {
                executionOrder.push('emit-1')
                yield 1
                await new Promise(resolve => setTimeout(resolve, 50))
                executionOrder.push('emit-2')
                yield 2
            })

            await sourceFlux.flatMap(async (value) => {
                executionOrder.push(`callback-start-${value}`)

                // First callback takes a long time (200ms)
                // Second emission happens at 50ms, so first callback still running
                const delay = value === 1 ? 200 : 50
                await new Promise(resolve => setTimeout(resolve, delay))

                executionOrder.push(`callback-end-${value}`)
            })

            // Verify execution order:
            // 1. emit-1
            // 2. callback-start-1
            // 3. emit-2 (happens while callback-1 is still running)
            // 4. callback-start-2 (starts even though callback-1 is still running)
            // 5. callback-end-2 (finishes first because shorter delay)
            // 6. callback-end-1 (finishes last)

            expect(executionOrder[0]).to.equal('emit-1')
            expect(executionOrder[1]).to.equal('callback-start-1')
            expect(executionOrder[2]).to.equal('emit-2')
            expect(executionOrder[3]).to.equal('callback-start-2')

            // Callback 2 should finish before callback 1
            const callback2EndIndex = executionOrder.indexOf('callback-end-2')
            const callback1EndIndex = executionOrder.indexOf('callback-end-1')
            expect(callback2EndIndex).to.be.lessThan(callback1EndIndex)
        })

        it('should process new emissions from Flux.create while previous async callback is still running', async () => {
            const executionOrder: string[] = []

            // Create a flux using Flux.create that emits asynchronously
            const sourceFlux = Flux.create<number>(async (push, complete) => {
                executionOrder.push('emit-1')
                push(1)
                await new Promise(resolve => setTimeout(resolve, 50))
                executionOrder.push('emit-2')
                push(2)
                complete()
            })

            const result = sourceFlux.flatMap(async (value) => {
                executionOrder.push(`callback-start-${value}`)

                // First callback takes a long time (200ms)
                // Second emission happens at 50ms, so first callback still running
                const delay = value === 1 ? 200 : 50
                await new Promise(resolve => setTimeout(resolve, delay))

                executionOrder.push(`callback-end-${value}`)
                return value * 10
            })

            await result.asList()

            // Verify execution order:
            // 1. emit-1
            // 2. callback-start-1
            // 3. emit-2 (happens while callback-1 is still running)
            // 4. callback-start-2 (starts even though callback-1 is still running)
            // 5. callback-end-2 (finishes first because shorter delay)
            // 6. callback-end-1 (finishes last)

            expect(executionOrder[0]).to.equal('emit-1')
            expect(executionOrder[1]).to.equal('callback-start-1')
            expect(executionOrder[2]).to.equal('emit-2')
            expect(executionOrder[3]).to.equal('callback-start-2')

            // Callback 2 should finish before callback 1
            const callback2EndIndex = executionOrder.indexOf('callback-end-2')
            const callback1EndIndex = executionOrder.indexOf('callback-end-1')
            expect(callback2EndIndex).to.be.lessThan(callback1EndIndex)
        })
    })

    describe('with Flux mapper', () => {
        it('should flatten Flux results from mapper function', async () => {
            const flux = Flux.fromArray([1, 2, 3])

            const result = flux.flatMap((value) =>
                Flux.fromArray([value * 10, value * 10 + 1])
            )

            const list = await result.asList()
            expect(list).to.deep.equal([10, 11, 20, 21, 30, 31])
        })

        it('should handle async Flux generation', async () => {
            const flux = Flux.fromArray([1, 2])

            const result = flux.flatMap((value) =>
                Flux.fromGeneratorFunction(async function* () {
                    await new Promise(resolve => setTimeout(resolve, 10))
                    yield value * 100
                    yield value * 100 + 1
                })
            )

            const list = await result.asList()
            expect(list).to.deep.equal([100, 101, 200, 201])
        })

        it('should execute callbacks in parallel', async () => {
            const executionOrder: string[] = []

            const flux = Flux.fromArray([1, 2, 3])

            const result = flux.flatMap((value) => {
                executionOrder.push(`start-${value}`)

                return Flux.fromGeneratorFunction(async function* () {
                    // Different delays to test parallel execution
                    const delay = value === 1 ? 300 : value === 2 ? 100 : 200
                    await new Promise(resolve => setTimeout(resolve, delay))

                    executionOrder.push(`end-${value}`)
                    yield value * 10
                })
            })

            await result.asList()

            // Verify all started before any completed
            const firstEndIndex = executionOrder.findIndex(event => event.startsWith('end-'))
            const allStartEvents = executionOrder.filter(event => event.startsWith('start-'))

            expect(allStartEvents.length).to.equal(3)
            expect(firstEndIndex).to.be.at.least(3) // All 3 starts should happen before first end

            // Verify completion order based on delays (shortest delay completes first)
            expect(executionOrder.indexOf('end-2')).to.be.lessThan(executionOrder.indexOf('end-3'))
            expect(executionOrder.indexOf('end-3')).to.be.lessThan(executionOrder.indexOf('end-1'))
        })

        it('should handle empty Flux results', async () => {
            const flux = Flux.fromArray([1, 2, 3])

            const result = flux.flatMap((value) =>
                value === 2 ? Flux.fromArray([value]) : Flux.fromArray([])
            )

            const list = await result.asList()
            expect(list).to.deep.equal([2])
        })

        it('should propagate errors from inner Flux', async () => {
            const flux = Flux.fromArray([1, 2, 3])

            const result = flux.flatMap((value) =>
                Flux.fromGeneratorFunction(async function* () {
                    if (value === 2) {
                        throw new Error('Test error')
                    }
                    yield value
                })
            )

            try {
                await result.asList()
                expect.fail('Should have thrown an error')
            } catch (error) {
                expect(error.message).to.equal('Test error')
            }
        })

        it('should handle mixed sync and async Flux sources', async () => {
            const flux = Flux.fromArray([1, 2, 3])

            const result = flux.flatMap((value) => {
                if (value === 1) {
                    // Sync array-based Flux
                    return Flux.fromArray([10, 11])
                } else if (value === 2) {
                    // Async generator-based Flux
                    return Flux.fromGeneratorFunction(async function* () {
                        await new Promise(resolve => setTimeout(resolve, 10))
                        yield 20
                        yield 21
                    })
                } else {
                    // ReadableStream-based Flux
                    return Flux.fromReadableStream(new ReadableStream({
                        async start(controller) {
                            controller.enqueue(30)
                            controller.enqueue(31)
                            controller.close()
                        }
                    }))
                }
            })

            const list = await result.asList()
            expect(list).to.deep.equal([10, 11, 20, 21, 30, 31])
        })

        it('should respect concurrency limit for Flux callbacks', async () => {
            const executionOrder: string[] = []
            let currentlyRunning = 0
            let maxConcurrentlyRunning = 0

            const flux = Flux.fromArray([1, 2, 3, 4, 5])

            const result = flux.flatMap((value) => {
                return Flux.fromGeneratorFunction(async function* () {
                    currentlyRunning++
                    maxConcurrentlyRunning = Math.max(maxConcurrentlyRunning, currentlyRunning)
                    executionOrder.push(`start-${value} (running: ${currentlyRunning})`)

                    // All have same delay to test concurrency limiting
                    await new Promise(resolve => setTimeout(resolve, 50))

                    currentlyRunning--
                    executionOrder.push(`end-${value}`)
                    yield value * 10
                })
            }, { concurrency: 2 })

            await result.asList()

            // With concurrency=2, max 2 should run concurrently
            expect(maxConcurrentlyRunning).to.equal(2)

            // Verify we never exceeded the limit
            for (const event of executionOrder) {
                if (event.includes('running:')) {
                    const runningCount = parseInt(event.match(/running: (\d+)/)?.[1] || '0')
                    expect(runningCount).to.be.at.most(2)
                }
            }
        })

        it('should handle nested flatMaps with async streaming flux and run all inner callbacks immediately', async () => {
            type Event = { fluxId: string, id: string, emitted: Instant }
            const executionLog: string[] = []

            const asynchronousFlux = (fluxId: string) => Flux.create<Event>(async (push, complete) => {
                if (fluxId === 'main') {
                    // Main flux emits 2 events asynchronously
                    executionLog.push('main-emit-event1')
                    push({ fluxId: 'main', id: 'event1', emitted: Instant.now() })

                    await sleep()

                    executionLog.push('main-emit-event2')
                    push({ fluxId: 'main', id: 'event2', emitted: Instant.now() })

                    complete()
                } else {
                    // Inner flux emits 2 events for each outer event
                    const parentId = fluxId.replace('flux-of-', '')
                    executionLog.push(`${fluxId}-emit-A`)
                    push({ fluxId, id: `${parentId}-A`, emitted: Instant.now() })

                    await sleep(30)

                    executionLog.push(`${fluxId}-emit-B`)
                    push({ fluxId, id: `${parentId}-B`, emitted: Instant.now() })

                    complete()
                }
            })

            await asynchronousFlux('main')
                .flatMap(async event => {
                    executionLog.push(`outer-flatmap-start-${event.id}`)

                    await asynchronousFlux(`flux-of-${event.id}`)
                        .flatMap(async innerEvent => {
                            executionLog.push(`inner-flatmap-start-${innerEvent.id}`)

                            // Different delays to verify parallel execution
                            const delay = innerEvent.id === 'event1-A' ? 100 :
                                        innerEvent.id === 'event1-B' ? 40 :
                                        innerEvent.id === 'event2-A' ? 60 : 30

                            await sleep(delay)

                            executionLog.push(`inner-flatmap-end-${innerEvent.id}`)
                        })

                    executionLog.push(`outer-flatmap-end-${event.id}`)
                })

            // Verify all inner flatMap callbacks were executed
            expect(executionLog).to.include('inner-flatmap-start-event1-A')
            expect(executionLog).to.include('inner-flatmap-start-event1-B')
            expect(executionLog).to.include('inner-flatmap-start-event2-A')
            expect(executionLog).to.include('inner-flatmap-start-event2-B')

            expect(executionLog).to.include('inner-flatmap-end-event1-A')
            expect(executionLog).to.include('inner-flatmap-end-event1-B')
            expect(executionLog).to.include('inner-flatmap-end-event2-A')
            expect(executionLog).to.include('inner-flatmap-end-event2-B')

            // Verify callbacks ran as soon as they could (in parallel)
            // event1-B should start before event1-A completes (since they run in parallel)
            const startIndexEvent1B = executionLog.indexOf('inner-flatmap-start-event1-B')
            const endIndexEvent1A = executionLog.indexOf('inner-flatmap-end-event1-A')
            expect(startIndexEvent1B).to.be.lessThan(endIndexEvent1A)

            // event1-B should complete before event1-A (40ms < 100ms)
            const endIndexEvent1B = executionLog.indexOf('inner-flatmap-end-event1-B')
            expect(endIndexEvent1B).to.be.lessThan(endIndexEvent1A)

            // Verify outer flatMap callbacks complete after their inner flatMaps
            const outerEndEvent1 = executionLog.indexOf('outer-flatmap-end-event1')
            expect(outerEndEvent1).to.be.greaterThan(endIndexEvent1A)
            expect(outerEndEvent1).to.be.greaterThan(endIndexEvent1B)
        })

        it('should emit all 16 values from nested async flux before outer flux completes', async () => {
            // Create outer flux that emits 1, 2, 3, 4 with delays between emissions
            const outerFlux = Flux.create<number>(async (push, complete) => {
                for (let i = 1; i <= 4; i++) {
                    push(i)
                    if (i < 4) await sleep(10) // Wait between emissions
                }
                complete()
            })

            // FlatMap to create inner fluxes that also emit 1, 2, 3, 4 with delays
            // flatMap should automatically wait for all inner fluxes to complete
            const collectedValues = await outerFlux.flatMap((outerValue) => {
                return Flux.create<{ outer: number, inner: number }>(async (push, complete) => {
                    for (let i = 1; i <= 4; i++) {
                        push({ outer: outerValue, inner: i })
                        if (i < 4) await sleep(10) // Wait between emissions
                    }
                    complete()
                })
            })

            // Verify we got all 16 values (4 outer × 4 inner)
            expect(collectedValues.length).to.equal(16)

            // Verify all combinations exist
            for (let outer = 1; outer <= 4; outer++) {
                for (let inner = 1; inner <= 4; inner++) {
                    const found = collectedValues.find(
                        v => v.outer === outer && v.inner === inner
                    )
                    expect(found).to.exist
                }
            }

            // Verify all inner values for each outer value are present
            for (let outer = 1; outer <= 4; outer++) {
                const innerValues = collectedValues
                    .filter(v => v.outer === outer)
                    .map(v => v.inner)
                    .sort()
                expect(innerValues).to.deep.equal([1, 2, 3, 4])
            }
        })
    })
})