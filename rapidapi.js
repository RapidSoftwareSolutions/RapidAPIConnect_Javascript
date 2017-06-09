/**
 * Created by sapirlasry on 30/05/2017.
 */
"use strict";

function RapidAPI (project, key) {
    this.project = project;
    this.key = key;

    /**
     * Returns the base URL for block calls
     * @returns {string} Base URL for block calls
     */
    this.getBaseURL = function () {
        return "https://rapidapi.io/connect";
    }

    /**
     * Build a URL for a block call
     * @param pack Package where the block is
     * @param block Block to be called
     * @returns {string} Generated URL
     */
    this.blockURLBuilder = function (pack, block) {
        return this.getBaseURL() + "/" + pack + "/" + block;
    }

    /**
     * Returns the base URL for webhook event callbacks
     * @return {string} Base URL for webhook event callbacks
     */
    this.callbackBaseURL = function () {
        return "https://webhooks.rapidapi.com";
    }

    /**
     * Call a block
     * @param pack Package of the block
     * @param block Name of the block
     * @param args Arguments to send to the block (JSON)
     */
    this.call = function (pack, block, args) {
        //Will hold all the callbacks user adds using .on()
        var __callbacks = {};

        var http = new XMLHttpRequest();
        var url = this.blockURLBuilder(pack, block);
        var data, has_file;
        http.open('POST', url, true);

        http.setRequestHeader("Authorization", "Basic " + btoa(this.project + ":" + this.key));
        http.setRequestHeader('User-Agent', 'JavascriptSDK');

        // run all over args to find file
        var has_file =
            Object.keys(args)
                .reduce(function (acc, val) {
                        return acc || args[val] instanceof File;
                    },
                    false);

        if (has_file) {
            // formData
            data = new FormData();
            Object.keys(args).forEach(function(key){
                data.append(key, args[key]);
            });
        } else {
            // body
            data = JSON.stringify(args) || {};
            http.setRequestHeader('Content-Type', 'application/json');
            http.setRequestHeader('Accept', 'application/json');
        }

        // after response return
        http.onload = function () {
            var body;

            // try to parse the json object and if not succeed return the string error to user as body
            try {
                body = JSON.parse(this.response);
            } catch (e) {
                body = this.response;
            }

            if (this.status !== 200 || !(body.hasOwnProperty('outcome'))) {
                if (__callbacks.hasOwnProperty('error')) {
                    __callbacks['error'](body);
                }
            } else {
                if (__callbacks.hasOwnProperty(body.outcome)) {
                    __callbacks[body.outcome](body.payload);
                }
            }
        };
        //Call the block
        http.send(data);

        //Return object that let's user add callback using .on()
        var r = {
            on: function (e, cb) {
                if (typeof cb == 'function' && typeof e == 'string') {
                    __callbacks[e] = cb;
                } else {
                    throw "Invalid event key and callback. Event key should be a string and callback should be a function."
                }
                return r;
            }
        };
        return r;
    }

    /**
     * Listen for webhook events
     * @param pack Package of the event
     * @param event Name of the event
     * @param callbacks Callback functions to call on message and on connection close
     */
    this.listen = function (pack, event, params) {
        var __callbacks = {};
        var __eventCallback = function (event) {
            return __callbacks[event] || function () {
                };
        };

        var user_id = pack + "." + event + "_" + this.project + ":" + this.key;
        var http = new XMLHttpRequest();
        var url = this.callbackBaseURL() + "/api/get_token?user_id=" + user_id;
        http.open("GET", url, true);
        http.setRequestHeader("Content-Type", "application/json");
        http.setRequestHeader("Authentication", "Basic " + btoa(this.project + ":" + this.key));

        // after the request for token
        http.onload = function () {

            var body;

            if (this.status === 200) {
                try {
                    if (typeof this.response !== 'object') {
                        body = JSON.parse(this.response);
                    }
                } catch (e) {
                    return;
                }
            }

            // user token
            var token = body.token;
            var sock_url = "wss://webhooks.rapidapi.com/socket/websocket?token=" + token;


            // open new socket to server
            var socket = new WebSocket(sock_url);

            // connect to server
            socket.onopen = function (event) {
                var connect = {'topic': "users_socket:" + token, 'event': 'phx_join', 'ref': '1', 'payload': params};
                socket.send(JSON.stringify(connect));
            };

            socket.onerror = __eventCallback('error');

            socket.onclose = __eventCallback('close');

            socket.onmessage = function (event) {
                try {
                    var data = JSON.parse(event.data);

                    if (data.payload.body) {
                        __eventCallback('message')(data.payload.body.text);
                    }
                }
                catch (e){
                    __eventCallback('error')();
                }
            };

            // set heartbeat every 30 seconds
            setInterval(function () {
                var heartbeat = {"topic": "phoenix", "event": "heartbeat", "ref": "1", "payload": {}};
                socket.send(JSON.stringify(heartbeat));
            }, 30000);

        };

        //Call the block (get the token)
        http.send();

        var r = {
            on: function (event, func) {
                if (typeof func !== 'function') throw "Callback must be a function.";
                if (typeof event !== 'string') throw "Event must be a string.";
                __callbacks[event] = func;
                return r;
            }
        };
        return r;
    }
}
