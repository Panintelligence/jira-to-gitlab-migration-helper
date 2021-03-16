var XMLHttpRequest = require("xmlhttprequest").XMLHttpRequest;

const request = {};
request.call = (method, url, headers, data) => {
    return new Promise((resolve, reject) => {
        var xhr = new XMLHttpRequest();
        xhr.withCredentials = true;

        xhr.addEventListener("readystatechange", function () {
            if (this.readyState === 4) {
                if (xhr.status >= 200 && xhr.status < 300) {
                    try {
                        resolve(this.responseText ? JSON.parse(this.responseText) : {});
                    } catch (e) {
                        reject({
                            status: xhr.status,
                            message: this.responseText,
                            error: e
                        });
                    }
                } else {
                    reject({
                        status: xhr.status,
                        message: this.responseText,
                        error: null
                    });
                }
            }
        });

        xhr.open(method, url);
        Object.keys(headers).forEach((header) => {
            xhr.setRequestHeader(header, headers[header]);
        });

        xhr.send(data || "");
    });
}
request.GET = async (url, headers) => {
    return await request.call("GET", url, headers);
}
request.DELETE = async (url, headers) => {
    return await request.call("DELETE", url, headers);
}
request.POST = async (url, headers, data) => {
    return await request.call("POST", url, headers, JSON.stringify(data));
}
request.PUT = async (url, headers, data) => {
    return await request.call("PUT", url, headers, JSON.stringify(data));
}

module.exports = request;