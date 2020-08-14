const SheetNotFoundError = require('../exceptions/sheetNotFoundError');
const ExceptionMessages = require('./exceptionMessages');
const config = require('../config');
const axios = require('axios');

const Api = function(apiUrl) {
    var self = {};

    self.init = function(callback) {
        var feedURL = config.API_URL + "/radarItems";
        return axios.get(feedURL).then(r => r.data);
    };

    return self;
};

module.exports = Api;