const request = require('./request');

// See https://app.swaggerhub.com/apis-docs/panintelligence/dashboard/ for v2 API

class Dashboard {
    constructor(url) {
        this.url = url;
        this.token = null;
    }

    async authenticate(username, password) {
        const headers = {
            "Authorization": `Basic ${username}:${password}`,
            "Content-Type": "application/json"
        }
        const response = await request.GET(`${this.url}/api/v2/tokens`, headers);
        this.token = response.token;
        return this.token;
    }

    async getChartAsJson(chartId) {
        const headers = {
            "Authorization": `Bearer ${this.token}`,
            "Content-Type": "application/json"
        }
        return await request.GET(`${this.url}/pi/export/json?chartId=${chartId}`, headers);
    }
}

module.exports = Dashboard;