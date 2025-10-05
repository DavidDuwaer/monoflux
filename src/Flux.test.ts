import {Flux} from "./Flux";
import {timer} from "./util/timer";
import {randomUuid} from "../tests/randomUuid";
import {assert, expect} from "chai";

describe('Flux', () => {
  describe('.create', () => {
    it('works if data is early', async () => {
      const flux = Flux.create((push, complete) => {
        push(1)
        push(2)
        push(3)
        complete()
      })
      for await (const nr of flux) {
        console.log(nr)
      }
    })
    it('works if data is late', async () => {
      const flux = Flux.create(async (push, complete) => {
        push(1)
        await timer(500)
        push(2)
        await timer(500)
        push(3)
        await timer(500)
        complete()
      })
      for await (const nr of flux) {
        console.log(nr)
      }
    })
    it('catches error if for-awaiting flux and error is early', async () => {
      const errorMsg = randomUuid()
      try {
        const flux = Flux.create(async (push, complete) => {
          push(1)
          throw new Error(errorMsg)
        })
        for await (const nr of flux) {
          console.log(nr)
        }
        assert.ok(false)
      } catch (e) {
        assert.ok(e.message === errorMsg)
      }
    })
    it('catches error if for-awaiting flux and error is late', async () => {
      const errorMsg = randomUuid()
      try {
        const flux = Flux.create(async (push, complete) => {
          push(1)
          await timer(500)
          throw new Error(errorMsg)
        })
        for await (const nr of flux) {
          console.log(nr)
        }
        assert.ok(false)
      } catch (e) {
        assert.ok(e.message === errorMsg)
      }
    })
  })

  describe('error handling in callbacks', () => {
    it('should propagate error from synchronous map callback to try/catch around await', async () => {
      const flux = Flux.fromArray([1, 2, 3])
      const specificError = new Error('Sync error in map')

      const mappedFlux = flux.map((value) => {
        if (value === 2) {
          throw specificError
        }
        return value * 2
      })

      try {
        await mappedFlux
        expect.fail('Should have thrown an error')
      } catch (error) {
        expect(error).to.equal(specificError)
      }
    })

    it('should propagate error from async callback before await to try/catch', async () => {
      const flux = Flux.fromArray([1, 2, 3])
      const specificError = new Error('Async error before await')

      const mappedFlux = flux.flatMap(async (value) => {
        // Error thrown before any await - still synchronous part
        if (value === 2) {
          throw specificError
        }
        return value * 2
      })

      try {
        await mappedFlux
        expect.fail('Should have thrown an error')
      } catch (error) {
        expect(error).to.equal(specificError)
      }
    })

    it('should propagate error from async callback after await to try/catch', async () => {
      const flux = Flux.fromArray([1, 2, 3])
      const specificError = new Error('Async error after await')

      const mappedFlux = flux.flatMap(async (value) => {
        // Break synchronicity with await
        await timer(10)

        // Error thrown after await - truly asynchronous
        if (value === 2) {
          throw specificError
        }
        return value * 2
      })

      try {
        await mappedFlux
        expect.fail('Should have thrown an error')
      } catch (error) {
        expect(error).to.equal(specificError)
      }
    })

    it('should propagate error from synchronous filter callback to try/catch around await', async () => {
      const flux = Flux.fromArray([1, 2, 3])
      const specificError = new Error('Sync error in filter')

      const filteredFlux = flux.filter((value) => {
        if (value === 2) {
          throw specificError
        }
        return value > 1
      })

      try {
        await filteredFlux
        expect.fail('Should have thrown an error')
      } catch (error) {
        expect(error).to.equal(specificError)
      }
    })

    it('should propagate error from Flux mapper to try/catch', async () => {
      const flux = Flux.fromArray([1, 2, 3])
      const specificError = new Error('Error in Flux mapper')

      const mappedFlux = flux.flatMap((value) => {
        return Flux.fromGeneratorFunction(async function* () {
          if (value === 2) {
            throw specificError
          }
          yield value * 2
        })
      })

      try {
        await mappedFlux
        expect.fail('Should have thrown an error')
      } catch (error) {
        expect(error).to.equal(specificError)
      }
    })
  })

  describe('race conditions', () => {
    it('should not skip flatMap callback for second emission even with blocking first callback', async () => {
      const executionOrder: string[] = []
      const callbacksExecuted: number[] = []

      // Create a flux using Flux.create that emits quickly
      const flux = Flux.create<number>(async (push, complete) => {
        executionOrder.push('emit-1')
        push(1)

        // Emit second value immediately (no delay)
        executionOrder.push('emit-2')
        push(2)

        complete()
      })

      const result = flux.flatMap(async (value) => {
        executionOrder.push(`callback-start-${value}`)
        callbacksExecuted.push(value)

        // First callback blocks for a long time
        if (value === 1) {
          await new Promise(resolve => setTimeout(resolve, 500))
        }

        executionOrder.push(`callback-end-${value}`)
        return value * 10
      })

      const results = await result.asList()

      // Verify both callbacks were executed
      expect(callbacksExecuted).to.deep.equal([1, 2], 'Both callbacks should have been executed')

      // Verify both values were processed
      expect(results.sort()).to.deep.equal([10, 20], 'Both values should be in results')

      // Verify execution order shows both callbacks started
      expect(executionOrder).to.include('callback-start-1')
      expect(executionOrder).to.include('callback-start-2')
    })

    it('should not skip flatMap callback for second emission with synchronous blocking first callback', async () => {
      const executionOrder: string[] = []
      const callbacksExecuted: number[] = []

      // Create a flux using Flux.create
      const flux = Flux.create<number>(async (push, complete) => {
        executionOrder.push('emit-1')
        push(1)

        executionOrder.push('emit-2')
        push(2)

        complete()
      })

      const result = flux.flatMap(async (value) => {
        executionOrder.push(`callback-start-${value}`)
        callbacksExecuted.push(value)

        // First callback does heavy synchronous work before any await
        if (value === 1) {
          // Simulate CPU-intensive synchronous work
          const start = Date.now()
          while (Date.now() - start < 100) {
            // Busy wait
          }
        }

        await new Promise(resolve => setTimeout(resolve, 10))

        executionOrder.push(`callback-end-${value}`)
        return value * 10
      })

      const results = await result.asList()

      // Verify both callbacks were executed despite synchronous blocking
      expect(callbacksExecuted).to.deep.equal([1, 2], 'Both callbacks should execute despite sync blocking')

      // Verify both values were processed
      expect(results.sort()).to.deep.equal([10, 20])

      // Verify execution order shows both callbacks started
      expect(executionOrder).to.include('callback-start-1')
      expect(executionOrder).to.include('callback-start-2')
    })

    it('should not skip flatMap callback when Flux.create emits in tight loop', async () => {
      const callbacksExecuted: number[] = []

      // Create a flux that emits many values in a tight loop
      const flux = Flux.create<number>(async (push, complete) => {
        for (let i = 1; i <= 10; i++) {
          push(i)
        }
        complete()
      })

      const result = flux.flatMap(async (value) => {
        callbacksExecuted.push(value)

        // First few callbacks take longer
        if (value <= 3) {
          await new Promise(resolve => setTimeout(resolve, 100))
        }

        return value * 10
      })

      const results = await result.asList()

      // All 10 callbacks should have been executed
      expect(callbacksExecuted).to.have.lengthOf(10, 'All callbacks should execute')
      expect(callbacksExecuted).to.deep.equal([1, 2, 3, 4, 5, 6, 7, 8, 9, 10])

      // All values should be in results
      expect(results.sort((a, b) => a - b)).to.deep.equal([10, 20, 30, 40, 50, 60, 70, 80, 90, 100])
    })

    it('should handle flatMap callback that returns Promise<void>', async () => {
      const callbacksExecuted: number[] = []

      const flux = Flux.create<number>(async (push, complete) => {
        push(1)
        await new Promise(resolve => setTimeout(resolve, 50))
        push(2)
        await new Promise(resolve => setTimeout(resolve, 50))
        push(3)
        complete()
      })

      const result = flux.flatMap(async (value): Promise<void> => {
        callbacksExecuted.push(value)
        // Returns void/undefined
      })

      await result.asList()

      // All callbacks should execute even though they return void
      expect(callbacksExecuted).to.deep.equal([1, 2, 3], 'All callbacks should execute for void-returning promises')
    })
  })

  describe('slow streaming source bug', () => {
    it('should run flatMap callbacks for slow streaming source with Promise<void> awaited directly', async function () {
      this.timeout(10000) // Increase timeout for slow test

      const callbacksExecuted: number[] = []
      const callbackTimestamps: number[] = []
      const emissionTimestamps: number[] = []
      const startTime = Date.now()

      // Create a very slow streaming source that emits over several seconds
      // flatMap with Promise<void> callback, awaited directly (no asList/toList)
      await Flux
        .create<number>(async (push, complete) => {
          emissionTimestamps.push(Date.now() - startTime)
          push(1)

          await new Promise(resolve => setTimeout(resolve, 1500))

          emissionTimestamps.push(Date.now() - startTime)
          push(2)

          await new Promise(resolve => setTimeout(resolve, 1500))

          emissionTimestamps.push(Date.now() - startTime)
          push(3)

          complete()
        })
        .flatMap(async (value): Promise<void> => {
          callbackTimestamps.push(Date.now() - startTime)
          callbacksExecuted.push(value)
          console.log(`Callback executed for value ${value} at ${Date.now() - startTime}ms`)
        })

      console.log('Emissions:', emissionTimestamps)
      console.log('Callbacks:', callbackTimestamps)

      // All callbacks should have been executed
      expect(callbacksExecuted).to.deep.equal([1, 2, 3], 'All callbacks should execute even with slow streaming source')

      // First callback should run shortly after first emission
      expect(callbackTimestamps[0]).to.be.lessThan(emissionTimestamps[0] + 100, 'First callback should run immediately')

      // Second callback should run shortly after second emission (around 1500ms)
      expect(callbackTimestamps[1]).to.be.greaterThan(1400, 'Second callback should run after delay')
      expect(callbackTimestamps[1]).to.be.lessThan(emissionTimestamps[1] + 100, 'Second callback should run shortly after second emission')

      // Third callback should run shortly after third emission (around 3000ms)
      expect(callbackTimestamps[2]).to.be.greaterThan(2900, 'Third callback should run after second delay')
      expect(callbackTimestamps[2]).to.be.lessThan(emissionTimestamps[2] + 100, 'Third callback should run shortly after third emission')
    })
  })
})