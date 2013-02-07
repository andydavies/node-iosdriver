/*
 * Copyright (c) 2013 Left Logic Ltd, http://leftlogic.com
 * Copyright (c) 2013 Andy Davies http://andydavies.me
 *
 * Permission is hereby granted, free of charge, to any person obtaining a copy of this
 * software and associated documentation files (the “Software”), to deal in the Software
 * without restriction, including without limitation the rights to use, copy, modify, merge,
 * publish, distribute, sublicense, and/or sell copies of the Software, and to permit persons
 * to whom the Software is furnished to do so, subject to the following conditions:
 *
 * The above copyright notice and this permission notice shall be included in all copies or
 * substantial portions of the Software.
 *
 * THE SOFTWARE IS PROVIDED “AS IS”, WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED,
 * INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE
 * AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE
 * FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR
 * OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER
 * DEALINGS IN THE SOFTWARE.
 */

/*
 * @TODO:
 *
 * - Which _rpc responses are missing (this is a process of discovery)
 * - Needs to support more than one tab
 * - Needs tests
 */

// Dependencies
var net = require('net');
    plist = require('plist'),
    bplist_create = require('node-bplist-creator'),
    bplist_parse = require('bplist-parser'),
    bufferpack = require('bufferpack'),
    uuid = require('node-uuid'),
    util = require('util'),
    events = require('events');

var noop = function () {};

// Used in _handleResponse to flag missing handlers
var noopHandler = function (plist) { console.warn("Add handler for:" + plist.__selector.slice(0, -1))};

/**
 * @constructor
 * @param {string} host must be IPv6 address
 * @param {int} port
 */
var iOSDriver = function (host, port) {

    // default if not provided
    host = host || '::1';
    port = port || 27753;

    this.conn_id = uuid.v4();
    this.sender_id = uuid.v4();
    this.page_id = 1;   // @TODO this probably shouldn't be defaulted to 1
    
    // Some responses from iOS span more than one packet so need to be buffered
    this.received = new Buffer(0);
    this.read_pos = 0;
    
    // unique id for each message
    this.msg_id = 0;

    // store state of connected device
    this.device = undefined;
    this.browser = undefined;
    this.tabs = undefined;

    // Socket and handlers
    var driver = this;

    // @TODO: 
    // - What other response types are there? (is this list documented anywhere?)
    // - Use registration method to allow replacement?
    // - Move emit('open')
    this.handlers = {
      _rpc_reportSetup: function (plist) { driver._onReportSetup(plist); },
      _rpc_reportConnectedApplicationList: function (plist) {  driver.emit('open'); driver._onReportConnectedApplicationList(plist); },
      _rpc_applicationSentListing: function (plist) { driver._onApplicationSentListing(plist); },
      _rpc_applicationSentData: function (plist) { driver._onApplicationSentData(plist); },
      _rpc_applicationDisconnected: function (plist) { driver._onApplicationDisconnected(plist); }
    };

    this.socket = new net.Socket({type: 'tcp6'});
    this.socket.connect(port, host, function () { noop(); });
    this.socket.on('data', function (data) { driver._onData(data); });
    this.socket.on('close', function () { noop(); });

    // @TODO these methods may need renaming
    this.setConnectionKey();
    this.connectToApp();
    this.setSenderKey();
}

util.inherits(iOSDriver, events.EventEmitter);

/**
 * Closes connection
 */
iOSDriver.prototype.close = function() {
    this.socket.end(); // @TODO check this is right?
}

/**
 * @returns {object} details of connected device
 */
iOSDriver.prototype.getDevice = function() {

    return this.device;
}

/**
 * @returns {object} list of active browsers (webviews as well?)
 */
iOSDriver.prototype.getBrowser = function() {

    return this.browser;
}

/**
 * @returns {object} list of tabs in connected browser
 */
iOSDriver.prototype.getTabs = function() {

    return this.tabs;
}

/**
 * Sets connection id, on success iOS returns _rpc_reportSetup
 */
iOSDriver.prototype.setConnectionKey = function() {

    var msg = {
        __argument: {
            WIRConnectionIdentifierKey: this.conn_id
        },
        __selector : '_rpc_reportIdentifier:'
    };

    this._send(msg);
};

/**
 * Connects to app, on success iOS returns _rpc_reportConnectedApplicationList
 */
iOSDriver.prototype.connectToApp = function() {

    var msg = {
        __argument: {
            WIRConnectionIdentifierKey: this.conn_id,
            WIRApplicationIdentifierKey: 'com.apple.mobilesafari'
        },
        __selector : '_rpc_forwardGetListing:'
    };

    this._send(msg);
};

/**
 * Sets sender key, on success iOS returns _rpc_applicationSentListing
 */
iOSDriver.prototype.setSenderKey = function() {

    var msg = {
          __argument: {
            WIRApplicationIdentifierKey: 'com.apple.mobilesafari',
            WIRConnectionIdentifierKey: this.conn_id,
            WIRSenderKey: this.sender_id,
            WIRPageIdentifierKey: this.page_id
        },
        __selector: '_rpc_forwardSocketSetup:'
    };

    this._send(msg);
};

/**
 * @TODO: Safari calls this but what does it do, seems no response to it?
 */
iOSDriver.prototype.indicateWebView = function(isWebView) {

    var msg = {
        __argument: {
            WIRApplicationIdentifierKey: 'com.apple.mobilesafari',
            WIRIndicateEnabledKey: isWebView,
            WIRConnectionIdentifierKey: this.conn_id,
            WIRPageIdentifierKey: this.page_id
        },
        __selector: '_rpc_forwardIndicateWebView:'
    };

    this._send(msg);
};

/**
 * Sends command to attached Safari instance 
 * @param {string} method 
 * @param {object} params
 * @returns {int} id of message sent
 *
 * @see For commands and parameters:  https://developers.google.com/chrome-developer-tools/docs/protocol/1.0/index
 */
iOSDriver.prototype.sendCommand = function(method, params) {
    
    // data must be a buffer otherwise Safari will crash
    var data = new Buffer(JSON.stringify({
            id: this.msg_id++,
            method: method,
            params: params
        }));

    var msg = {
        __argument: {
            WIRApplicationIdentifierKey: 'com.apple.mobilesafari',
            WIRSocketDataKey: data,
            WIRConnectionIdentifierKey: this.conn_id,
            WIRSenderKey: this.sender_id,
            WIRPageIdentifierKey: this.page_id     // @TODO
        },
        __selector: '_rpc_forwardSocketData:'
    };

    this._send(msg);

    return this.msg_id;
};

// Socket 

/**
 * Converts plist binary and sends to iOS
 * @param {object} data plist to be send
 * @param {object} callback function to be called after data sent
 */
 iOSDriver.prototype._send = function(data, callback) {
    callback = callback || noop;

    var plist;
    try {
        plist = bplist_create(data);
    }
    catch(e) {
        return console.error(e);
    }

    this.socket.write(bufferpack.pack('L', [plist.length]));
    this.socket.write(plist, callback);
};

/**
 * Reassembles response from iOS (if it spans multiple messages) and 
 * converts from binary plist to plist
 * @param {object} data response from iOS
 */
iOSDriver.prototype._onData = function(data) {  

    // Append this new data to the existing Buffer
    this.received = Buffer.concat([this.received, data]);

    var data_left_over = true; 

    // Parse multiple messages in the same packet
    while(data_left_over) {
  
        // Store a reference to where we were
        var old_read_pos = this.read_pos;

        // Read the prefix (plist length) to see how far to read next
        // It's always 4 bytes long
        var prefix = this.received.slice(this.read_pos, this.read_pos + 4);
        var msg_length;

        try {
            msg_length = bufferpack.unpack('L', prefix)[0];
        }
        catch(e) {
            return log(e);
        }

        // Jump forward 4 bytes
        this.read_pos += 4;

        // Is there enough data here?
        // If not, jump back to our original position and gtfo
        if( this.received.length < msg_length + this.read_pos ) {
            this.read_pos = old_read_pos;
            break;
        }

        // Extract the main body of the message (where the plist should be)
        var body = this.received.slice(this.read_pos, msg_length + this.read_pos);

        // Extract the plist
        var plist;
        try {
            plist = bplist_parse.parseBuffer(body);
        } 
        catch (e) {
            console.error(e);
        }

        // bplist_parse.parseBuffer returns an array
        if(plist.length === 1) {
            plist = plist[0];
        }

    // Jump forward the length of the plist
    this.read_pos += msg_length;

    // Calculate how much buffer is left
    var left_over = this.received.length - this.read_pos;

    // Is there some left over?
    if( left_over !== 0 ) {
      // Copy what's left over into a new buffer, and save it for next time
      var chunk = new Buffer(left_over);
      this.received.copy(chunk, 0, this.read_pos);
      this.received = chunk;
    } 
    else {
      // Otherwise, empty the buffer and get out of the loop
      this.received = new Buffer(0);
      data_left_over = false;
    }

    // Reset the read position
    this.read_pos = 0;

    // Now do something with the plist
    if(plist) {
      this._handleResponse(plist);
    }
  }
};


/**
 * Dispatches reponse from iOS to appropriate handler 
 * @param {object} plist response from iOS as plist
 */
iOSDriver.prototype._handleResponse = function(plist) {  

    if(!plist.__selector) {
        return;
    }

    var selector = plist.__selector.slice(0, -1);

    (this.handlers[selector] || noopHandler)(plist);
};

/**
 * Handles _rpc_reportSetup, stores connected device details
 * @param {object} plist response from iOS as plist
 *
 * @TODO: What about other e.g. non-simulator, devices?
 */
iOSDriver.prototype._onReportSetup = function(plist) {

    if(plist.__argument && plist.__argument.WIRSimulatorNameKey) {
        this.device = {
            name: plist.__argument.WIRSimulatorNameKey,
            version: plist.__argument.WIRSimulatorBuildKey
        };
    }
    else {
        this.device = undefined;
    }

//    console.log(this.device);
}

/**
 * Handles _rpc_reportConnectedApplicationList, stores app details
 * @param {object} plist response from iOS as plist
 *
 * @TODO:
 * - What if more that one app can be connected to, is this code still right?
 * - Cleanup iteration code
 */
iOSDriver.prototype._onReportConnectedApplicationList = function(plist) {

    if(plist.__argument && plist.__argument.WIRApplicationDictionaryKey) {
        this.browser = {};
        for(entry in plist.__argument.WIRApplicationDictionaryKey) {
            this.browser[plist.__argument.WIRApplicationDictionaryKey[entry].WIRApplicationIdentifierKey] = {
                name: plist.__argument.WIRApplicationDictionaryKey[entry].WIRApplicationNameKey,
                proxy: plist.__argument.WIRApplicationDictionaryKey[entry].WIRIsApplicationProxyKey
            };
        }
    }
    else {
        this.browser = undefined;
    }

//    console.log(this.browser);
}

/**
 * Handles _rpc_applicationSentListing, stores list of available pages
 * @param {object} plist response from iOS as plist
 *
 * @TODO: 
 * - What if more that one app can be connected to, is this code still right?
 * - Cleanup iteration code
 * - WIRConnectionIdentifierKey
 */
iOSDriver.prototype._onApplicationSentListing = function(plist) {

    if(plist.__argument && plist.__argument.WIRListingKey) {
        this.tabs = {};
        for(entry in plist.__argument.WIRListingKey) {
            this.tabs[plist.__argument.WIRListingKey[entry].WIRPageIdentifierKey] = {
                title: plist.__argument.WIRListingKey[entry].WIRTitleKey,
                url: plist.__argument.WIRListingKey[entry].WIRURLKey
            };
        }
    }
    else {
        this.tabs = undefined;
    }

//    console.log(this.tabs);
}

/**
 * Handles _rpc_applicationSentData i.e. response from sendCommand, extracts JSON reponse object and emits message with it
 * @param {object} plist response from iOS as plist
 */
iOSDriver.prototype._onApplicationSentData = function(plist) {

    if(plist.__argument && plist.__argument.WIRMessageDataKey) {
        this.emit('message', plist.__argument.WIRMessageDataKey.toString());
    }
}

/**
 * Handles _rpc_applicationDisconnected
 * @param {object} plist response from iOS as plist
 */
iOSDriver.prototype._onApplicationDisconnected = function (plist) { 

    this.emit('close');
}

module.exports = iOSDriver;
