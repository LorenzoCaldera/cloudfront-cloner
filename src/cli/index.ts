import { CloudFrontClient } from "@aws-sdk/client-cloudfront";
import { fromIni } from "@aws-sdk/credential-providers";
import { parseArgs } from "../helpers/parseArgs";

const args = process.argv.slice(2); // skip first two (node executable and script path)
const parsedArgs = parseArgs(args);

console.log(parsedArgs);