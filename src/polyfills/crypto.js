// Crypto polyfill for Hermes/React Native
var Buffer = require('buffer/').Buffer
var ripemd160 = require('ripemd160')

class Hash {
  constructor(algo) {
    this._algo = algo.toLowerCase().replace(/[-_]/g, '')
    this._data = ''
  }
  update(data, inputEnc) {
    if (data instanceof Buffer) data = data.toString('binary')
    if (inputEnc && inputEnc !== 'utf8' && inputEnc !== 'utf-8') {
      if (inputEnc === 'hex') {
        data = Buffer.from(data, 'hex').toString('binary')
      }
    }
    this._data += data
    return this
  }
  digest(outputEnc) {
    var algo = this._algo
    var buf
    if (algo === 'sha256') {
      var CryptoJS = require('crypto-js')
      var result = CryptoJS.SHA256(CryptoJS.enc.Utf8.parse(this._data))
      buf = Buffer.from(result.toString(CryptoJS.enc.Hex), 'hex')
    } else if (algo === 'sha512') {
      var CryptoJS = require('crypto-js')
      var result = CryptoJS.SHA512(CryptoJS.enc.Utf8.parse(this._data))
      buf = Buffer.from(result.toString(CryptoJS.enc.Hex), 'hex')
    } else if (algo === 'ripemd160') {
      var bytes = []
      for (var i = 0; i < this._data.length; i++) {
        bytes.push(this._data.charCodeAt(i))
      }
      buf = Buffer.from(ripemd160(bytes))
    } else {
      throw new Error('Unsupported hash algorithm: ' + algo)
    }
    this._data = ''
    return outputEnc === 'base64' ? buf.toString('base64') : buf
  }
}

module.exports = {
  createHash: function (algo) { return new Hash(algo) },
  randomBytes: function (size) {
    var bytes = new Uint8Array(size)
    crypto.getRandomValues(bytes)
    return Buffer.from(bytes)
  }
}
