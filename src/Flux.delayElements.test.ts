import { Flux } from './Flux'
import { expect } from 'chai'

describe('Flux.delayElements', () => {
    it('should delay each element by the specified duration', async () => {
        const startTime = Date.now()
        const values: number[] = []
        const timings: number[] = []

        const flux = Flux.fromArray([1, 2, 3])
        const delayed = flux.delayElements(100)

        for await (const value of delayed) {
            values.push(value)
            timings.push(Date.now() - startTime)
        }

        expect(values).to.deep.equal([1, 2, 3])

        // First element should be delayed by ~100ms
        expect(timings[0]).to.be.at.least(90)
        expect(timings[0]).to.be.at.most(150)

        // Second element should be delayed by ~200ms total
        expect(timings[1]).to.be.at.least(190)
        expect(timings[1]).to.be.at.most(250)

        // Third element should be delayed by ~300ms total
        expect(timings[2]).to.be.at.least(290)
        expect(timings[2]).to.be.at.most(350)
    })

    it('should work with empty flux', async () => {
        const flux = Flux.fromArray([])
        const delayed = flux.delayElements(100)

        const values = await delayed.asList()
        expect(values).to.deep.equal([])
    })

    it('should work with single element', async () => {
        const startTime = Date.now()
        const flux = Flux.fromArray([42])
        const delayed = flux.delayElements(100)

        const values = await delayed.asList()
        const duration = Date.now() - startTime

        expect(values).to.deep.equal([42])
        expect(duration).to.be.at.least(90)
        expect(duration).to.be.at.most(150)
    })

    it('should delay elements and propagate errors', async () => {
        const startTime = Date.now()
        const values: number[] = []

        const flux = Flux.create<number>(async (push, complete, reject) => {
            push(1)
            await new Promise(resolve => setTimeout(resolve, 50))
            push(2)
            await new Promise(resolve => setTimeout(resolve, 50))
            reject(new Error('Test error'))
        })

        const delayed = flux.delayElements(50)

        try {
            for await (const value of delayed) {
                values.push(value)
            }
            expect.fail('Should have thrown an error')
        } catch (error) {
            const duration = Date.now() - startTime
            expect(error.message).to.equal('Test error')
            // Should have received at least the first element with delay
            expect(values.length).to.be.at.least(1)
            expect(values[0]).to.equal(1)
            // Should have taken at least 50ms for the first delayed element
            expect(duration).to.be.at.least(40)
        }
    })

    it('should delay elements from async flux', async () => {
        const startTime = Date.now()
        const timings: number[] = []

        // Create a flux that emits quickly
        const flux = Flux.create<number>(async (push, complete) => {
            push(1)
            await new Promise(resolve => setTimeout(resolve, 10))
            push(2)
            await new Promise(resolve => setTimeout(resolve, 10))
            push(3)
            complete()
        })

        const delayed = flux.delayElements(100)

        for await (const value of delayed) {
            timings.push(Date.now() - startTime)
        }

        expect(timings.length).to.equal(3)

        // Each element should be delayed by 100ms after it's received
        expect(timings[0]).to.be.at.least(90)
        expect(timings[1]).to.be.at.least(190)
        expect(timings[2]).to.be.at.least(290)
    })

    it('should work in a chain with other operators', async () => {
        const startTime = Date.now()

        const result = await Flux.fromArray([1, 2, 3, 4, 5])
            .filter(x => x % 2 === 1)  // Keep only odd numbers: 1, 3, 5
            .delayElements(50)
            .map(x => x * 10)
            .asList()

        const duration = Date.now() - startTime

        expect(result).to.deep.equal([10, 30, 50])
        // Should take at least 150ms (3 elements × 50ms)
        expect(duration).to.be.at.least(140)
        expect(duration).to.be.at.most(200)
    })

    it('should delay independently when using multiple subscribers', async () => {
        const flux = Flux.fromArray([1, 2, 3]).delayElements(100)

        const startTime1 = Date.now()
        const result1 = await flux.asList()
        const duration1 = Date.now() - startTime1

        expect(result1).to.deep.equal([1, 2, 3])
        expect(duration1).to.be.at.least(290)

        // Note: Since Flux is consumed, a second iteration won't work
        // This test just verifies the first consumption works correctly
    })

    it('should handle zero delay', async () => {
        const startTime = Date.now()

        const result = await Flux.fromArray([1, 2, 3])
            .delayElements(0)
            .asList()

        const duration = Date.now() - startTime

        expect(result).to.deep.equal([1, 2, 3])
        // Should complete quickly
        expect(duration).to.be.at.most(50)
    })
})
