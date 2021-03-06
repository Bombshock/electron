/*global angular*/

(function () {
  'use strict';

  var Q = require("q");
  var remote = require("remote");
  var child_process = remote.require("child_process");

  angular.module("app").service("execute", executeService);

  executeService.$inject = ["CMDMessage", "bash", "mainProcess"];

  function executeService(CMDMessage, bash, mainProcess) {

    function execute(line, tab, cwd) {
      var input = line;
      var args = input.split(" ");
      var bin = args.shift();
      var regexString = args.join(" ");
      var escaped = false;
      var last = null;
      var soFar = "";

      args = [];

      for (var i = 0; i < regexString.length; i++) {
        var char = regexString[i];
        if (char === '"' && last !== "\\") {
          escaped = !escaped;
        } else if (char === " " && !escaped && i !== 0) {
          args.push(soFar);
          soFar = "";
        } else if (char !== "\\") {
          soFar += char;
        }
        last = char;
      }

      args.push(soFar);

      cwd = cwd || tab.cwd;

      if (tab.history[tab.history.length - 1] !== input) {
        tab.history.push(input);
      }

      var message = new CMDMessage(cwd + "> " + input, CMDMessage.TYPE_COMMAND);
      tab.lines.push(message);
      tab.historyIndex = null;

      if (!line) {
        return;
      }

      args = args.filter(function (arg) {
        return !!arg.trim();
      });

      if (bin in bash) {
        Q.when(bash[bin].apply(bash[bin], [args, stdout, stderr, tab]))
          .finally(function () {
            mainProcess.$emit("cycle");
          });
      } else {
        // cmd "/s", "/c"
        // PowerShell "-NoProfile", "-NonInteractive", "-NoLogo", "-ExecutionPolicy", "Bypass", "-Command"
        args.unshift(bin);
        args = ["/S", "/C"].concat(args);

        console.log("EXECUTE ::", "cmd", args.join(" "));
        tab.child = child_process.spawn("cmd", args, {
          cwd: cwd
        });

        tab.child.bin = bin;
        tab.child.command = input;
        tab.child.cwd = tab.cwd;
        tab.child.msg = message;

        tab.child.stderr.setEncoding('utf8');
        tab.child.stdout.setEncoding('utf8');

        tab.child.stdout.on('data', stdout);
        tab.child.stderr.on('data', stderr);

        for (var j = 0; j < tab.child.stdio.length; j++) {
          var io = tab.child.stdio[j];
          if (io) {
            io.on('readable', createBufferReader("stdio[" + j + "].readable"));
            io.on('data', createBufferReader("stdio[" + j + "].data"));
            io.on('end', createBufferReader("stdio[" + j + "].end"));
            io.on('close', createBufferReader("stdio[" + j + "].close"));
            io.on('error', createBufferReader("stdio[" + j + "].error"));
          }
        }

        tab.child.on('close', function (code) {
          console.log('child process exited with code ' + code);
          if (code !== 0) {
            tab.lines.push(new CMDMessage('child process exited with code ' + code, CMDMessage.TYPE_SUCCESS));
          }
          tab.child = null;

          mainProcess.$emit("cycle");
        });
      }

      function stdout(msg) {
        if (msg instanceof Buffer) {
          for (var i = 0; i < msg.length; i++) {
            var char = msg[i];
            switch (char) {
              case 12:
                tab.lines = [];
                msg = "";
                break;
            }
          }
        }

        msg = msg.toString().split("\n");

        for (var j = 0; j < msg.length; j++) {
          var line = msg[j];
          tab.lines.push(new CMDMessage(line));
        }

        mainProcess.$emit("cycle");
      }

      function stderr(msg) {
        if (msg instanceof Buffer) {
          msg = msg.asciiSlice();
        } else {
          msg = msg.stack ? msg.stack : msg.toString();
        }

        msg = msg.toString().split("\n");

        for (var j = 0; j < msg.length; j++) {
          var line = msg[j];
          tab.lines.push(new CMDMessage(line, CMDMessage.TYPE_ERROR));
        }

        mainProcess.$emit("cycle");
      }
    }

    return execute;
  }

  function createBufferReader(name) {
    return function (buffer) {
      console.log("BUFFER :: %s:", name, buffer ? buffer.toString() : arguments);
    };
  }

})();