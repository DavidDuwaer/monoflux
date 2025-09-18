import { Flux } from './Flux'
import { expect } from 'chai'

describe('Flux.flatMap', () => {
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
})