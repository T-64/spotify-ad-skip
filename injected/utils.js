
// https://medium.com/@karenmarkosyan/how-to-manage-promises-into-dynamic-queue-with-vanilla-javascript-9d0d1f8d4df5
class PromiseQueue {
    constructor(timeoutMs = 10000)
    {
        this.queue = [];
        this.workingOnPromise = false;
        this.timeoutMs = timeoutMs;
    }

    // If the item doesn't settle within timeoutMs, the queue moves on to the next item
    // so one stuck item can't block every later /state request and WebSocket message.
    // On timeout the item resolves with fallback() if given, otherwise it keeps waiting
    // for its own result (but without holding the queue).
    enqueue(promise, argument, fallback = null) {
      return new Promise((resolve, reject) => {
          this.queue.push({
              promise,
              argument,
              fallback,
              resolve,
              reject,
          });
          this.dequeue();
      });
    }

  dequeue() {
      if (this.workingOnPromise) {
        return false;
      }
      const item = this.queue.shift();
      if (!item) {
        return false;
      }

      var released = false;
      var settled = false;
      const release = () => {
        if (released) return;
        released = true;
        clearTimeout(timer);
        this.workingOnPromise = false;
        this.dequeue();
      };

      this.workingOnPromise = true;
      const timer = setTimeout(() => {
        console.warn("SpotiAds: queue item timed out after " + this.timeoutMs + "ms, releasing queue");
        if (item.fallback && !settled) {
          settled = true;
          try {
            item.resolve(item.fallback());
          } catch (err) {
            item.reject(err);
          }
        }
        release();
      }, this.timeoutMs);

      try {
        item.promise(item.argument)
          .then((value) => {
            if (!settled) { settled = true; item.resolve(value); }
            release();
          })
          .catch(err => {
            if (!settled) { settled = true; item.reject(err); }
            release();
          })
      } catch (err) {
        if (!settled) { settled = true; item.reject(err); }
        release();
      }
      return true;
    }
}
