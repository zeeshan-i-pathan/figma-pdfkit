let _ = require('lodash');
const fs = require('fs');
const PDFDocument = require('pdfkit');

exports.generatePDF = function(req) {
    let request = req;
    request.total = request.items.reduce((i,j) => i+j.amount,0);
    const template = require("./figma_testing_2.json").document.children[0].children[0].children[0];
    const doc = new PDFDocument({size: 'A4',pdfVersion: "1.7", margins: {top: template.paddingTop,bottom: template.paddingBottom,left: template.paddingLeft,right: template.paddingRight}});
    checkNode(_.cloneDeep(template),0,doc,request)
    
    doc.pipe(fs.createWriteStream('output.pdf'));
    doc.end();    
}

function checkNode(node,nodeIndex,doc,request) {
    // Looping through the different nodes;
    processNode(node, doc, request)
    if (node.children) {
        let calculatedY = node.absoluteBoundingBox.y + (node.paddingTop||0);
        let padding = Array(nodeIndex).fill("  ").join("");
        for (let child of node.children) {
            // console.log(padding,"Calculated","y:",calculatedY, node.absoluteBoundingBox.y)
            // console.log(padding,"From Figma","y:",child.absoluteBoundingBox.y,"height:",child.absoluteBoundingBox.height,child.layoutMode || "TEXT")
            child.absoluteBoundingBox.y = calculatedY
            checkNode(child, nodeIndex+1,doc,request)
            if (node.layoutMode=="VERTICAL") {
                calculatedY+= child.absoluteBoundingBox.height;
            }
        }
    }
}

function processNode(node,doc, request) {
    if (node.locked) {
        // Locked Nodes treated as Static content
        applyStyling(node,doc,request)
    } else {
        // Other nodes treated as Dynamic Nodes. Request Applied to them
        if (node.name.startsWith("Row")) {
            // If Dynamic Node is a Column
            params = node.name.split("|");
            // Check which model to apply to this Dynamic Node
            key = params[1];
            // Check Maximum columns in a Row
            max = params[2] || 1;
            // The Child element is the template to build individual instances of the model
            let template = node.children.pop()
            // How many dynamic rows / columns to be added
            let count = request[key].length;
            if (max && max<count) {
                // Set count to max if this param available
                count = max;
            }
            // calculate the width of the individual column
            let new_width = template.absoluteBoundingBox.width / count;
            // follow the height from the template
            let height = template.absoluteBoundingBox.height
            // Index and Row count for the loop
            let idx = 0;
            let row = 0;
            // Max usable height if content overflows
            let max_height = doc.page.height-(doc.page.margins.bottom+doc.page.margins.top);
            let cal_height = node.absoluteBoundingBox.height;
            node.absoluteBoundingBox.height = 0;
            // properties to handle page_break
            let page_break_props = {curr_idx:0,method: 'ceil'};
            for (let req of request[key]) {
                // When to go to next row
                if (idx>=count) {
                    idx = 0;
                    row += 1;
                }
                node.absoluteBoundingBox.height += cal_height;
                // New instance of the template
                let instance = _.cloneDeep(template)
                // New width & x / y co-ordinates for the instance
                instance.absoluteBoundingBox.width = new_width;
                instance.absoluteBoundingBox.x = node.absoluteBoundingBox.x+(new_width*idx)+(node.paddingLeft || 0);
                instance.absoluteBoundingBox.y = node.absoluteBoundingBox.y+(height*row)+(node.paddingTop || 0);
                // check if need to page break
                let page_idx = Math.floor((instance.absoluteBoundingBox.y+height)/ max_height);
                if (page_idx > 0) {
                    // Apply page break related adjustments
                    applyPageBreakRelatedStyle(instance, page_break_props, page_idx, doc, request)
                }
                // apply dynamic ajustments to the children and lock the node to make it ready to render
                setDynamicText(instance, req, doc, request);
                instance.locked = true;
                // add the instance to the parent
                node.children.push(instance);
                idx += 1;
            }
            // Render the parent as if it was a static locked node
            applyStyling(node, doc, request)
            // console.log(JSON.stringify(node))
        }
    }
}

function applyPageBreakRelatedStyle(instance, page_break_props, page_idx, doc, request) {
    let new_height = doc.page.height + doc.page.margins.top;
    let height = instance.absoluteBoundingBox.height;
    let current_height = instance.absoluteBoundingBox.y + height;                    
    if (page_break_props.curr_idx < page_idx) {
        page_break_props.curr_idx = page_idx;
        height = instance.absoluteBoundingBox.height;
        current_height = instance.absoluteBoundingBox.y + height;
        instance.page_break = true
        if (Math[page_break_props.method]((current_height - new_height) / height)>0) {
            page_break_props.method='floor'
        } else if (Math[page_break_props.method]((current_height - new_height / height)<0)) {
            page_break_props.method='ceil'
        }
    }
    instance.absoluteBoundingBox.y = (new_height + Math[page_break_props.method]((current_height - new_height) / height) * height - (doc.page.height))
    let max_height = doc.page.height - (doc.page.margins.top + doc.page.margins.bottom)
    temp_page_idx = Math.floor((instance.absoluteBoundingBox.y + height) / max_height);
    if(temp_page_idx>0) {
        if(temp_page_idx+1==page_idx) {
            applyPageBreakRelatedStyle(instance, page_break_props, page_idx, doc, request)
        } else {
            applyPageBreakRelatedStyle(instance, page_break_props, temp_page_idx + 1, doc, request)
        }
        // applyPageBreakRelatedStyle(instance, page_break_props, Math.floor((instance.absoluteBoundingBox.y + height) / max_height))
    }
}

function setDynamicText(instance, req, doc, request) {
    instance.locked = true;
    let idx = 0;
    for (child of instance.children) {
        // child.absoluteBoundingBox.width = instance.absoluteBoundingBox.width - ((instance.paddingLeft||0)+(instance.paddingRight||0));
        // child.absoluteBoundingBox.x = instance.absoluteBoundingBox.x+(instance.paddingLeft||0)
        child.absoluteBoundingBox.y = instance.absoluteBoundingBox.y+(instance.paddingTop||0)
        // if (idx>0) {
        //     child.absoluteBoundingBox.y += instance.children.slice(0,idx).reduce((i,j) => i+j.absoluteBoundingBox.height, 0)
        // }
        if (child.name=="Section") {
            setDynamicText(child, req, doc, request)
            child.locked = true
        } else {
            doc.save()
            doc.fontSize(child.style.fontSize);
            doc.font('fonts/'+child.style.fontPostScriptName.replace("Roman","")+'.ttf')
            let regex = RegExp(/{{([0-9a-zA-Z.]+)}}/)
            replace = regex.exec(child.characters)
            child.characters = child.characters.replace(replace[0], req[replace[1]] || "")
            child.locked = true
            let current_height = child.absoluteBoundingBox.height;
            let dynamic_height = Math.round(doc.heightOfString(child.characters, {width: child.absoluteBoundingBox.width}));
            if (dynamic_height> current_height) {
                console.log(dynamic_height, current_height, child.absoluteBoundingBox.width)
                let ratio = Math.floor((current_height/ dynamic_height)*10)/10;
                child.characters = child.characters.slice(0,child.characters.length*ratio)+".....";
                // To Do increase height of the Dynamic Column to accomodate this
                console.log("Problem -> Dynamic Height more than the provided height")
            }
            doc.restore();
        }
        idx += 1;
    }
}
function applyStyling(node, doc, request) {
    if (node.page_break) {
        doc.addPage()
    }
    
    if (node.name=="Section") {
        doc.save()
        doc.rect(node.absoluteBoundingBox.x, node.absoluteBoundingBox.y, node.absoluteBoundingBox.width, node.absoluteBoundingBox.height);
        if (node.fills[0]) {
           doc.fill(rgba2hex(node.fills[0].color));
        } else {
            doc.fillOpacity(0.0).fill("#000")
        }
        doc.restore();
        startX = node.absoluteBoundingBox.x+(node.paddingLeft || 0);
        startY = node.absoluteBoundingBox.y+(node.paddingTop || 0);
    }
    if (node.name=="Text") {
        doc.fontSize(node.style.fontSize);
        doc.font('fonts/'+node.style.fontPostScriptName.replace("Roman","")+'.ttf')
        let extra = 0;
        textHeight = Math.round(doc.heightOfString(node.characters, {width: node.absoluteBoundingBox.width}))
        if (node.style.textAlignVertical=='CENTER') {
            extra = Math.round((node.absoluteBoundingBox.height - textHeight) / 2)
        }
        doc.fill(rgba2hex(node.fills[0].color))
        let regex = RegExp(/{{([0-9a-zA-Z.]+)}}/)
        replace = regex.exec(node.characters)
        if (replace) {
            node.characters = node.characters.replace(replace[0], request[replace[1]] || "")
        }
        doc.text(node.characters,node.absoluteBoundingBox.x, node.absoluteBoundingBox.y + extra,{
            width: node.absoluteBoundingBox.width,
            align: node.style.textAlignHorizontal.toLowerCase(),
        })
    }
}

function rgba2hex(orig) {
    if (orig) {
        var a, isPercent, hex =
            (orig.r * 255 | 1 << 8).toString(16).slice(1) +
            (orig.g * 255 | 1 << 8).toString(16).slice(1) +
            (orig.b * 255 | 1 << 8).toString(16).slice(1)
        // (orig.a * 255 | 1 << 8).toString(16).slice(1)  
        return "#" + hex;
    }
    return null
}