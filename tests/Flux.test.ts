import {Flux} from "../src"
import "mocha";
import {randomUuid} from "./randomUuid"
import {expect} from "chai";

describe('Flux', () => {
    it('passes value', async () => {
        const sourceValue = randomUuid()
        const value = await Flux
            .fromGeneratorFunction<string>(
                async function* () {
                    yield sourceValue
                }
            )
            .asList()
        expect(value[0]).to.equal(sourceValue)
    })
    it('passes an exception', async () => {
        const sourceValue = randomUuid()
        const caught = await (async () => {
            try {
                const value = await Flux
                    .fromGeneratorFunction<string>(
                        async function* () {
                            throw sourceValue
                        }
                    )
                    .asList()
            } catch (err) {
                return err
            }
        })()
        expect(caught).to.equal(sourceValue)
    })
    it('passes an exception through a map operator', async () => {
        const sourceValue = randomUuid()
        const caught = await (async () => {
            try {
                const value = await Flux
                    .fromGeneratorFunction<string>(
                        async function* () {
                            throw sourceValue
                        }
                    )
                    .map(value => value)
                    .asList()
            } catch (err) {
                return err
            }
        })()
        expect(caught).to.equal(sourceValue)
    })
    it('passes an exception through an iterating consumer', async () => {
        const sourceValue = randomUuid()
        const caught = await (async () => {
            try {
                const flux = Flux
                    .fromGeneratorFunction<string>(
                        async function* () {
                            yield 'foo'
                            throw sourceValue
                        }
                    )
                for await (const value of flux) {
                    // do nothing
                }
            } catch (err) {
                return err
            }
        })()
        expect(caught).to.equal(sourceValue)
    })
    it('passes an exception from a readablestream', async () => {
        const sourceValue = randomUuid()
        const caught = await (async () => {
            try {
                const stream = new ReadableStream({
                    start(controller) {
                        controller.enqueue('foo')
                        controller.error(sourceValue)
                    }
                })
                const flux = Flux.fromReadableStream(stream)
                for await (const value of flux) {
                    // do nothing
                }
            } catch (err) {
                return err
            }
        })()
        expect(caught).to.equal(sourceValue)
    })
})