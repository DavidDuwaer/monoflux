<p align="center">
Monoflux
 </p>
<p align="center">
Stream processing library for JS. An API so simple, it makes asyncronous streams seem like arrays.
 </p>


```javascript
const {body} = await fetch(/* ... */)
for await (const message of Flux.fromReadableStream(body)) {
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
