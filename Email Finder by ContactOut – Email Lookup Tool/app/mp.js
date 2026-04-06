// mp.js -- monkey patch

(function () {
  var x = XMLHttpRequest; // eslint-disable-line
  var open = x.prototype.open; // eslint-disable-line
  var send = x.prototype.send; // eslint-disable-line
  x.prototype.open = function (method, url) {
    this.url = url;
    open.apply(this, arguments);
  };
  x.prototype.send = function () {
    this.addEventListener('load', async function () {
      window.document.dispatchEvent(
        new CustomEvent('apiResponseRecorded', {
          detail: {
            response: this.response,
            url: this.url,
          },
        })
      );
    });
    send.apply(this, arguments);
  };
})();
