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
})