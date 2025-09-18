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
})