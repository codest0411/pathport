#!/usr/bin/env node
/* global process */

import { runCli } from "../dist/cli.js";

const exitCode = await runCli(process.argv.slice(2));
process.exitCode = exitCode;
