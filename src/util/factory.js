const d3 = require('d3');
const Tabletop = require('tabletop');
const _ = {
    map: require('lodash/map'),
    uniqBy: require('lodash/uniqBy'),
    capitalize: require('lodash/capitalize'),
    each: require('lodash/each')
};

const InputSanitizer = require('./inputSanitizer');
const Radar = require('../models/radar');
const Quadrant = require('../models/quadrant');
const Ring = require('../models/ring');
const Blip = require('../models/blip');
const GraphingRadar = require('../graphing/radar');
const MalformedDataError = require('../exceptions/malformedDataError');
const SheetNotFoundError = require('../exceptions/sheetNotFoundError');
const ContentValidator = require('./contentValidator');
const Sheet = require('./sheet');
const Api = require('./api');
const config = require('../config');
const ExceptionMessages = require('./exceptionMessages');

const plotRadar = function(title, blips) {
    // var date = title.indexOf('current.csv') >= 0 ? new Date() : new Date(title.substring(0, title.length - 4));
    let date = new Date();
    var q = Math.ceil((date.getMonth() + 1) / 3);

    document.title = date.getFullYear() + ' Q' + q + ' Teknoloji Radarı';
    d3.selectAll(".loading").remove();

    var rings = _.map(_.uniqBy(blips, 'ring'), 'ring');
    var ringMap = {};
    var maxRings = 4;

    _.each(rings, function(ringName, i) {
        if (i == maxRings) {
            throw new MalformedDataError(ExceptionMessages.TOO_MANY_RINGS);
        }
        ringMap[ringName] = new Ring(ringName, i);
    });

    var quadrants = {};
    _.each(blips, function(blip) {
        if (!quadrants[blip.quadrant]) {
            quadrants[blip.quadrant] = new Quadrant(_.capitalize(blip.quadrant));
        }
        quadrants[blip.quadrant].add(new Blip(blip.name, ringMap[blip.ring], blip.isNew.toLowerCase() === 'true', blip.topic, blip.description))
    });

    var radar = new Radar();
    _.each(quadrants, function(quadrant) {
        radar.addQuadrant(quadrant)
    });

    var size = (window.innerHeight - 133) < 620 ? 620 : window.innerHeight - 133;

    new GraphingRadar(size, radar).init().plot();
}

const GoogleSheet = function(sheetReference, sheetName) {
    var self = {};

    self.build = function() {
        var sheet = new Sheet(sheetReference);
        sheet.exists(function(notFound) {
            if (notFound) {
                plotErrorMessage(notFound);
                return;
            }

            Tabletop.init({
                key: sheet.id,
                callback: createBlips
            });
        });

        function createBlips(__, tabletop) {

            try {

                if (!sheetName) {
                    sheetName = tabletop.foundSheetNames[0];
                }
                var columnNames = tabletop.sheets(sheetName).columnNames;

                var contentValidator = new ContentValidator(columnNames);
                contentValidator.verifyContent();
                contentValidator.verifyHeaders();

                var all = tabletop.sheets(sheetName).all();
                var blips = _.map(all, new InputSanitizer().sanitize);

                plotRadar(tabletop.googleSheetName, blips);
            } catch (exception) {
                plotErrorMessage(exception);
            }
        }
    };

    self.init = function() {
        plotLoading();
        return self;
    };

    return self;
};

const CSVDocument = function(url) {
    var self = {};

    self.build = function() {

        d3.dsv('|', url).then(createBlips);
    }

    var createBlips = function(data) {
        try {
            var columnNames = ['name', 'ring', 'quadrant', 'isNew', 'description'];
            var contentValidator = new ContentValidator(columnNames);
            contentValidator.verifyContent();
            contentValidator.verifyHeaders();
            var blips = _.map(data, new InputSanitizer().sanitize);
            plotRadar(FileName(url), blips);
        } catch (exception) {
            plotErrorMessage(exception);
        }
    }

    self.init = function() {
        plotLoading();
        return self;
    };

    return self;
};

const ApiCall = function(url) {
    var self = {};

    self.build = function() {
        Api(url).init().then(createBlips);
    }

    var createBlips = function(data) {
        try {
            var columnNames = ['name', 'ring', 'quadrant', 'isNew', 'description'];
            var contentValidator = new ContentValidator(columnNames);
            contentValidator.verifyContent();
            contentValidator.verifyHeaders();
            var blips = _.map(data, new InputSanitizer().sanitize);
            plotRadar(FileName(url), blips);
        } catch (exception) {
            plotErrorMessage(exception);
        }
    }

    self.init = function() {
        plotLoading();
        return self;
    };

    return self;
};

const QueryParams = function(queryString) {
    var decode = function(s) {
        return decodeURIComponent(s.replace(/\+/g, " "));
    };

    var search = /([^&=]+)=?([^&]*)/g;

    var queryParams = {};
    var match;
    while (match = search.exec(queryString))
        queryParams[decode(match[1])] = decode(match[2]);

    return queryParams
};

const DomainName = function(url) {
    var search = /.+:\/\/([^\/]+)/;
    var match = search.exec(decodeURIComponent(url.replace(/\+/g, " ")));
    return match == null ? null : match[1];
}


const FileName = function(url) {
    var search = /([^\/]+)$/;
    var match = search.exec(decodeURIComponent(url.replace(/\+/g, " ")));
    if (match != null) {
        var str = match[1];
        return str;
    }
    return url;
}

const GoogleSheetInput = function() {
    var self = {};

    self.build = function() {
        var search = window.location.search.substring(1);
        var domainName = DomainName(search);
        var queryParams = QueryParams(search);

        if (queryParams.radar) {
            var baseUrl = location.protocol + '//' + location.host + location.pathname;
            var sheet = CSVDocument(baseUrl + '/radars/' + queryParams.radar + '.csv');
            sheet.init().build();
        } else {
            if (domainName && queryParams.sheetId.endsWith('csv')) {
                var sheet = CSVDocument(queryParams.sheetId);
                sheet.init().build();
            } else if (domainName && domainName.endsWith('google.com') && queryParams.sheetId) {
                var sheet = GoogleSheet(queryParams.sheetId, queryParams.sheetName);
                console.log(queryParams.sheetName)

                sheet.init().build();
            } else {
                var api = ApiCall(config.API_URL);
                api.init().build();
                // var baseUrl = location.protocol + '//' + location.host + location.pathname;
                // var sheet = CSVDocument(baseUrl + '/radars/current.csv?$t=new Date().getTime()');
                // sheet.init().build();
            }
        }
    };

    return self;
};

function set_document_title() {
    document.title = "Doğuş Teknoloji Radarı";
}

function plotLoading(content) {
    var content = d3.select('body')
        .append('div')
        .attr('class', 'loading')
        .append('div')
        .attr('class', 'input-sheet');

    set_document_title();

    plotLogo(content);
}

function plotLogo(content) {
    content.append('div')
        .attr('class', 'input-sheet__logo')
        .html('<a href="https://www.d-teknoloji.com.tr"><img src="/images/dt-logo.png" / ></a>');
}

function plotFooter(content) {
    content
        .append('div')
        .attr('id', 'footer')
        .append('div')
        .attr('class', 'footer-content')
        .append('p')
        .html('<a href="https://github.com/DogusTeknoloji/build-your-own-radar">Project</a> Forked From <a href="https://github.com/thoughtworks/build-your-own-radar">ThoughtWorks build-your-own-radar</a>');
}

function plotBanner(content, text) {
    content.append('div')
        .attr('class', 'input-sheet__banner')
        .html(text);
}

function plotErrorMessage(exception) {
    d3.selectAll(".loading").remove();
    var message = 'Hata oluştu! ';

    if (exception instanceof MalformedDataError) {
        message = message.concat(exception.message);
    } else if (exception instanceof SheetNotFoundError) {
        message = exception.message;
    } else {
        console.error(exception);
    }

    d3.select('body')
        .append('div')
        .attr('class', 'error-container')
        .append('div')
        .attr('class', 'error-container__message')
        .append('p')
        .html(message);
}

module.exports = GoogleSheetInput;