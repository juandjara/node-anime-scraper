/* eslint
  quotes:0,
  camelcase:0,
  no-param-reassign:0,
  class-methods-use-this:0,
  object-curly-spacing:0 
*/

const got = require('got');
const debug = require('debug')('test');
const Promise = require('bluebird');
const cloudscraper = Promise.promisifyAll(require('cloudscraper'));
const _ = require('lodash');
const cheerio = require('cheerio');
const Bottleneck = require('bottleneck');
const KissCookie = require('./cookie-storage');

let b = new Bottleneck(1, 0);

class InvalidUserAgentError extends Error {
  constructor() {
    super();
    this.name = 'InvalidUserAgentError';
    this.message = `The user-agent used to request content differs from the user-agent accepted by Cloudflare.`;
    Error.captureStackTrace(this, InvalidUserAgentError);
  }
}

class InvalidCFCookieError extends Error {
  constructor() {
    super();
    this.name = 'InvalidCFCookieError';
    this.message = `The the cloudflare cookie used to request content is no longer valid.`;
    Error.captureStackTrace(this, InvalidCFCookieError);
  }
}

class BlockedError extends Error {
  constructor(reason, body) {
    super();
    const $ = cheerio.load(body);
    reason = $('.barContent').text();
    this.name = 'BlockedError';
    this.message = `You have been blocked, the page states:  ${reason.trim()}`;
    Error.captureStackTrace(this, BlockedError);
  }
}

class MaxRetryError extends Error {
  constructor() {
    super();
    this.name = 'MaxRetryError';
    this.message = `Retrieving page after 5 attempts failed. Something has most likely been broken by external forces.`;
    Error.captureStackTrace(this, MaxRetryError);
  }
}

class KissHTTP {
  constructor(options) {
    const DEFAULT_OPTIONS = {
      method: 'GET',
      headers: {
        'user-agent': 'got/6.11 (https://github.com/sindresorhus/got)'
      },
      followRedirect: true,
      save_cookies: true,
    };
    this.options = _.merge(DEFAULT_OPTIONS, options);

    if (this.options.save_cookies) {
      this.cookie_storage = new KissCookie();
      this.options.headers.cookie = this.cookie_storage.loadCookie();
    }
  }

  setDelay(amount) {
    b = new Bottleneck(1, amount);
    return b;
  }

  getFreshCookie() {
    debug('Retrieving fresh Cloudflare cookie.');
    return new Promise((resolve, reject) => {
      return cloudscraper.get('https://kissanime.ru', (err, resp) => {
        if (err) {
          return reject(new Error('Unable to bypass Cloudflare protection.'));
        }
        this.options.headers.cookie = resp.request.headers.cookie;
        if (this.options.save_cookies) {
          this.cookie_storage.saveCookie(resp.request.headers.cookie);
        }
        debug('Fresh Cloudflare cookie retrieved.');
        resolve();
      }, { 'User-Agent': this.options.headers['user-agent'] });
    });
  }

  request(url, options) {
    if (options == null) {
      options = {retries: 0};
    }
    const local_options = _.merge(this.options, options);
    return b.schedule(got, url, local_options)
    .then((resp) => {
      if (resp.body.indexOf('Are you human?') > -1) {
        throw new BlockedError('Captcha Blocked', resp.body);
      } else if (resp.body.indexOf('does not allow unofficial apps') > -1) {
        throw new BlockedError('Blocked IP', resp.body);
      } else {
        return resp;
      }
    }).catch((err) => {
      debug(err);
      if (err instanceof BlockedError) {
        throw err;
      } else if (err.name === 'HTTPError') {
        debug(`Received HTTP error retrieving URL: ${url}`);
        throw err;
      } else if (local_options.retries > 5) {
        throw new MaxRetryError();
      }

      if (err.name === 'InvalidCFCookieError') {
        throw new InvalidCFCookieError();
      } else {
        throw err;
      }
    }).catch((err) => {
      local_options.retries += 1;
      if ((err.name === 'MaxRetryError') || (err.name === 'BlockedError')) {
        throw err;
      } else {
        return this.getFreshCookie()
        .then(() => this.request(url, local_options));
      }
    });
  }
}

export default KissHTTP;