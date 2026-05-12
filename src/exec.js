// src/exec.js
const { exec, execFile } = require('child_process');

function runCommand(cmd) {
  return new Promise((resolve, reject) => {
    exec(cmd, { maxBuffer: 10 * 1024 * 1024 }, (err, stdout, stderr) => {
      if (err) {
        reject(new Error(`Command failed: ${cmd}\n${stderr || err.message}`));
        return;
      }
      resolve(stdout.trim());
    });
  });
}

function runCommandArgs(cmd, args) {
  return new Promise((resolve, reject) => {
    execFile(cmd, args, { maxBuffer: 10 * 1024 * 1024 }, (err, stdout, stderr) => {
      if (err) {
        reject(new Error(`Command failed: ${cmd} ${args.join(' ')}\n${stderr || err.message}`));
        return;
      }
      resolve(stdout.trim());
    });
  });
}

module.exports = { runCommand, runCommandArgs };
