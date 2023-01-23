'use strict';


/**
 *
 * body Invoice_request 
 * returns byte[]
 **/
const D = require('./generate_pdf');
exports.generate_invoicePOST = function(body) {
  D.generatePDF(body);
  return new Promise(function(resolve, reject) {
    var examples = {};
    examples['application/pdf'] = generatePDF(body);
    if (Object.keys(examples).length > 0) {
      resolve(examples[Object.keys(examples)[0]]);
    } else {
      resolve();
    }
  });
}

