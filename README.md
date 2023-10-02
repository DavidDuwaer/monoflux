<p align="center">
Monoflux
 </p>
<p align="center">
Stream processing for JS simplified
 </p>


```javascript
const response = await fetch(/* ... */)
const carLogs = Flux.fromReadableStream(response.body)
    .filter(e => e.topic === 'cars')
    .map(e => e.text)
for await (const message of carLogs) {
    // do stuff with message
}
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
