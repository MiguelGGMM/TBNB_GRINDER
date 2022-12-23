require('https').globalAgent.options.ca = require('ssl-root-cas').create();
const HttpsProxyAgent = require("https-proxy-agent");
const ethers = require('ethers');
const Web3 = require('web3');
const address = require('./address.json');
const crypto = require('crypto');
const axios = require('axios');
const WebSocket = require('ws');

const wsProvider = new ethers.providers.JsonRpcProvider(address.rpcProvider);
const recipient = address.recipient;
const httpsAgent = new HttpsProxyAgent({ host: address.proxyHost, port: address.proxyPort, auth: address.userAndPass })
const twoCaptchaKEY = address["2captchaKEY"];

var total = 0;
var success = 0;
var captchasSkipped = 0;
var totalBNBfunded = 0;

var initDate = Date.now();

console.log("IN");

const run = async () => {

    while(true){
        getBNBFaucet();
        var randomTimeInMs = Math.random() * (8000);
        await sleep(4000 + randomTimeInMs);
    }
};

const getBNBFaucet = async () => {

    try
    {
        var socket = null;

        try
        {
            var pkGenerated = `0x${crypto.randomBytes(32).toString('hex')}`;
            var wallet = new ethers.Wallet(pkGenerated);
            var account = wallet.connect(wsProvider);

            // Get the captcha ID...
            var answer = await axios.get(`http://2captcha.com/in.php?key=${twoCaptchaKEY}&method=hcaptcha&sitekey=d9a9ee67-74da-4601-9f31-efe6a297a5cc&pageurl=https://testnet.binance.org/faucet-smart`);
            if(answer.data.split('|').length != 2){
                return; // if error we skip
            }

            // Try solve the captcha...
            var twoCaptchaQueryCheck = `http://2captcha.com/res.php?key=${twoCaptchaKEY}&action=get&id=${answer.data.split('|')[1]}`;
            answer = await axios.get(twoCaptchaQueryCheck);
            var n_calls = 0;
            while(answer == null || answer.data == "CAPCHA_NOT_READY"){
                if(n_calls > 12){
                    captchasSkipped++;
                    return; // We skip after 12 tries
                }
                answer = await axios.get(twoCaptchaQueryCheck);
                await sleep(5000);
                n_calls++;
            }

            // Take the token and use it to ask the page for TBNB...
            var token = answer.data.split('|')[1];
            socket = new WebSocket(`wss://testnet.binance.org/faucet-smart/api`, { agent: httpsAgent });
            var connected = false;
            socket.onmessage = function(event){
                var msg = JSON.parse(event.data);
                if(msg === null){
                    return;
                }
                connected = true;
            }
            while(connected == false){
                await sleep(3000);
            }
            socket.send(JSON.stringify({url: account.address, symbol: 'BNB', tier: 0, captcha: token}));

            // Check account balance for 1 minute...
            var balance_acc = 0;
            var tries = 0;
            await sleep(100);
            while(balance_acc == 0 && tries < 50){
                balance_acc = await account.getBalance();
                balance_acc = balance_acc.mul(100).div(101);
                await sleep(1000);
                tries++;
            }
            var tx = {
                to: recipient,
                value: balance_acc,
            }
            if(tries < 50){
                var tx = await account.sendTransaction(tx);
                let receipt = await tx.wait();
                totalBNBfunded += parseFloat(fromWei(balance_acc.mul(100).div(101).toString()));
                success++;
            }else{
                console.log(`${local_time()}, too much time waiting for receiving BNB on ${account.address}`);
            }
        }catch(err){
            console.log(err.toString());
            if(socket != null){
                socket.close();
            }
        }
        finally{
            total++;
            console.log(`${local_time()} Exit percentage: ${success} of ${total}`);
            console.log(`${local_time()} Total BNB funded: ${totalBNBfunded}`);
            console.log(`${local_time()} Captchas skipped: ${captchasSkipped}`);
            console.log(`${local_time()} ${time_running()}`);
            if(socket != null){
                socket.close();
            }
        }
    }catch(err){
        console.log(`Unexpected error: ${err}`);
    }
}

function local_time() {
    return new Date().toLocaleTimeString('es-ES');
}
function time_running(){
    return `${(((Date.now() - initDate)/1000)/60).toString().substring(0, 4)} minutes`;
}
const sleep = ms => new Promise(r => setTimeout(r, ms));
const fromWei = (value, fixed=2) => parseFloat(Web3.utils.fromWei(value)).toFixed(fixed);

process.on('uncaughtException', err => {
    console.log('Unexpected error:', err);
  });

(async() => {
    run();
})();