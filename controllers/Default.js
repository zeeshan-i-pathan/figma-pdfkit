'use strict';

var utils = require('../utils/writer.js');
var Default = require('../service/DefaultService');

module.exports.generate_invoicePOST = function generate_invoicePOST (req, res, next, body) {
  Default.generate_invoicePOST(body)
    .then(function (response) {
      utils.writeJson(res, response);
    })
    .catch(function (response) {
      utils.writeJson(res, response);
    });
};
