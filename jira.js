const request = require('./request');

class Jira {
    constructor(url, authToken) {
        this.url = url;
        this.authToken = authToken;
    }

    async getComments(issueCode) {
        const headers = {
            "Authorization": `Basic ${this.authToken}`,
            "Content-Type": "application/json"
        }
        return await request.GET(`${this.url}/rest/api/2/issue/${issueCode}/comment`, headers);
    }
}

module.exports = Jira;