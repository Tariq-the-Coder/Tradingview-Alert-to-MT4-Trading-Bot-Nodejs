const express = require('express');
const app = express();
const bodyParser = require('body-parser');
const dotenv = require("dotenv");
const MetaApi = require('metaapi.cloud-sdk').default;
const axios = require('axios');
dotenv.config();
app.use(bodyParser.json());
app.use(express.json());

const token = process.env.TOKEN;
const accountId = process.env.ACCOUNT_ID;
const login = process.env.LOGIN;
const serverName = process.env.PASSWORD;
const password = process.env.SERVER_NAME;
const API_URL = process.env.META_API_SERVER_URL;
const api = new MetaApi(token);


app.get('/', async(req, res) => {
    res.send("Server Ready")
});

app.post('/trade', async(req, res) => {
    const { actionType, symbol, volume, openPrice, distance, stopLoss, takeProfit } = req.body;
    req.setTimeout(60000); // Set timeout to 60 seconds (in milliseconds)
    try {
        // Add test MetaTrader account
        let accounts = await api.metatraderAccountApi.getAccounts();
        let account = accounts.find(a => a.login === login && a.type.startsWith('cloud'));
        if (!account) {
            console.log('Adding MT4 account to MetaApi');
            account = await api.metatraderAccountApi.createAccount({
                name: 'Test account',
                type: 'cloud',
                login: login,
                password: password,
                server: serverName,
                platform: 'mt4',

            });
        } else {
            console.log('MT4 account already added to MetaApi');
        }

        // wait until account is deployed and connected to broker
        console.log('Deploying account');
        await account.deploy();
        console.log('Waiting for API server to connect to broker (may take couple of minutes)');
        await account.waitConnected();

        // connect to MetaApi API
        let connection = account.getRPCConnection();
        await connection.connect();

        // wait until terminal state synchronized to the local state
        console.log('Waiting for SDK to synchronize to terminal state (may take some time depending on your history size)');
        await connection.waitSynchronized();

        // Trade Place 
        const order = {
            actionType: actionType,
            symbol: symbol,
            volume: volume,
            openPrice: openPrice,
            takeProfit: takeProfit,
            stopLoss: stopLoss,
            stopLossUnits: "RELATIVE_PIPS",
            takeProfitUnits: "RELATIVE_PIPS",
            trailingStopLoss: {
                distance: {
                    distance: distance,
                    units: "RELATIVE_PIPS"
                }
            }
        };

        const config = {
            headers: {
                'Content-Type': 'application/json',
                'Accept': 'application/json',
                'auth-token': `${token}`
            }
        };

        await axios.post(`${API_URL}/users/current/accounts/${accountId}/trade`, order, config)
            .then((response) => {
                console.log(response.data);
                res.status(201).json(response.data);
            })
            .catch((error) => {
                console.error(error);
            });


        // finally, undeploy account after the test
        // console.log('Undeploying MT4 account so that it does not consume any unwanted resources');
        // await connection.close();
        // await account.undeploy();
    } catch (err) {
        // process errors
        if (err.details) {
            // returned if the server file for the specified server name has not been found
            // recommended to check the server name or create the account using a provisioning profile
            if (err.details === 'E_SRV_NOT_FOUND') {
                console.error(err);
                // returned if the server has failed to connect to the broker using your credentials
                // recommended to check your login and password
            } else if (err.details === 'E_AUTH') {
                console.log(err);
                // returned if the server has failed to detect the broker settings
                // recommended to try again later or create the account using a provisioning profile
            } else if (err.details === 'E_SERVER_TIMEZONE') {
                console.log(err);
            }
        }
        console.error(err);
    }
});


const port = 3000;
app.listen(port, () => {
    console.log(`Server running at http://localhost:${port}`);
});
