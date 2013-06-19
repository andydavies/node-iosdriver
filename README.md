**Google have released their own proxy for communicating with iOS Safari [ios-webkit-debug](https://github.com/google/ios-webkit-debug-proxy) and you proably want to use that instead of this**

#node-iosdriver

Allows communication with Safari running on iOS Simulator

**This is very much work-in-progress** (as can be seen from the number of @TODO comments).

It was built by packet dumping the communications between the debugger in Safari and Safari on iOS, so as a we get a clearer understanding of the communication, method names etc. may well change.

Safari uses the same debugging commands as Chrome but wrapped as binary plists over RPC rather than JSON over websockets.

A guide to the Chrome commands is available from Google:
[https://developers.google.com/chrome-developer-tools/docs/protocol/1.0/index](https://developers.google.com/chrome-developer-tools/docs/protocol/1.0/index)

##Installation

    $ npm install iosdriver

##Example

    var iOSDriver = require('iosdriver');

    var driver = new iOSDriver();

    driver.sendCommand('Inspector.enable');

    driver.sendCommand('Runtime.evaluate', {
        'expression': 'alert("Hello")',
        'objectGroup': 'console',
        'includeCommandLineAPI': true,
        'doNotPauseOnExceptionsAndMuteConsole': true,
        'returnByValue': false});
        
##Origins

Tom Ashworth [(@phuunet)](https://twitter.com/phuunet) and Remy Sharp [(@rem)](https://twitter.com/rem) at Left Logic (http://leftlogic.com) wrote the initial code enabling communication with Safari on the iOS Simulator. (I just fixed a showstopper of a bug and refactored it into a module)

You can find the original code here: https://github.com/leftlogic/remote-debug/tree/master/safari

##License

Copyright (c) 2013 Left Logic Ltd, http://leftlogic.com  
Copyright (c) 2013 Andy Davies http://andydavies.me

Permission is hereby granted, free of charge, to any person obtaining a copy of this software and associated documentation files (the “Software”), to deal in the Software without restriction, including without limitation the rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the Software, and to permit persons to whom the Software is furnished to do so, subject to the following conditions:
 
The above copyright notice and this permission notice shall be included in all copies or substantial portions of the Software.
 
THE SOFTWARE IS PROVIDED “AS IS”, WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.
