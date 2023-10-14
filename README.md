<p align="center">
Monoflux
 </p>
<p align="center">
Stream processing for JS that makes streams literally easy as arrays.
 </p>


```javascript
const flux = ... // a Flux<string>, monoflux's object for an asyncronous stream
for await (const message of flux) {
    console.log(message) // happens asynchronously!
}
```


# Install

```typescript
npm install monoflux
```

# Usage examples
Transforming a Flux
```typescript
chatMessages // a Flux<Message>
  .filter(chatMessage => chatMessage.recipient === 'david') // a Flux<Message>
  .map(chatMessage => chatMessage.text) // a Flux<string>
```

Doing stuff with events
```typescript
const chatMessages // = a Flux<string>
for await (const message of chatMessages) {
    console.log(message) // happens asynchronously!
}
// and Flux can do much, much more...
```

For collecting all events in an array, you can just treat the Flux like a promise, i.e.
```typescript
const fluxOfStrings // = a Flux<string>
const arrayOfStrings = await fluxOfStrings // becomes a string[]
```

or

```typescript
fluxOfStrings // = a Flux<string>
  .then(arrayOfStrings => /* do stuff */)
```

Consuming a streaming http response
```typescript
const reader = new TextDecoder()
const {body} = await fetch(/* ... */)
const flux = Flux.fromReadableStream(body) // a Flux<Uint8Array>, monoflux's object for an asyncronous stream
  .map(d => reader.decode(d)) // a Flux<string>
for await (const message of flux) {
    console.log(message) // happens asynchronously!
}
// and Flux can do much, much more...
```




# Feedback

If something is missing from this library that makes it not fit your use case today, or if you find a bug that spoils
it for you, don't hesitate to create an Issue (just a stub is better than nothing!) or a Pull Request. At this moment, the library is not at 1.0 yet and is organically growing to suit the use cases we run into first! Any feedback and/or contribution is sincerely appreciated.


# License

The content of this project is licensed under the MIT license.
