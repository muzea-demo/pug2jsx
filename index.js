const pug2jsx = require('./pug2jsx')

const button = document.getElementById('button')
const input = document.getElementById('input')
const output = document.getElementById('output')
button.addEventListener('click', function() {
  const inputValue = input.value
  output.value = pug2jsx(inputValue)
})
