/* eslint camelcase:0 */
const Promise = require('bluebird');
const fs = Promise.promisifyAll(require('fs'));
const path = require('path');
const debug = require('debug')('cookies');
const _ = require('lodash');

class KissCookie {
  constructor(options) {
    const DEFAULT_OPTIONS = {
      directory: 'data',
      cookie_filename: 'cloudflare.cookie'
    };
    this.options = _.merge(DEFAULT_OPTIONS, options);
    this.options.directory = path.join(__dirname, '..', this.options.directory);
    this.options.cookie_path =
      path.join(this.options.directory, this.options.cookie_filename);
  }

  saveCookie(cookie_string) {
    if (!fs.existsSync(this.options.directory)) {
      fs.mkdirSync(this.options.directory);
    }

    return fs.writeFileSync(this.options.cookie_path, cookie_string);
  }

  loadCookie() {
    const cookieExists = fs.existsSync(this.options.cookie_path);
    return cookieExists ?
      fs.readFileSync(this.options.cookie_path).toString().trim() : '';
  }
}

export default KissCookie;
