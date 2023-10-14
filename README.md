<p align="center">
Monoflux
 </p>
<p align="center">
Stream processing for JS that makes streams literally easy as arrays.
 </p>


```javascript
const {body} = await fetch(/* ... */)
const flux = Flux.fromReadableStream(body) // a Flux, monoflux's object for an asyncronous stream
for await (const message of flux) {
    console.log(message) // happens asynchronously!
}
// and Flux can do much, much more...
```


# Install

```typescript
npm install monoflux
```

# Feedback

If something is missing from this library that makes it not fit your use case today, or if you find a bug that spoils
it for you, don't hesitate to create an Issue (just a stub is better than nothing!) or a Pull Request. At this moment, the library is not at 1.0 yet and is organically growing to suit the use cases we run into first! Any feedback and/or contribution is sincerely appreciated.


# License

The content of this project is licensed under the MIT license.
