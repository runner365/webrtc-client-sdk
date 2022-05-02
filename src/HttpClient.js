
class HttpClient
{
    constructor() {
    }

    Post(url, data, cors) {
        cors = cors || 'cors';
        return fetch(url, {
            method: 'POST',
            mode: cors,
            headers: {
                'Content-Type': `text/plain;charset=utf-8`,
                // 'Cache-Control': 'no-cache'
            },
            body: data
        }).then(res=>res.text());
    }

    Get(url) {
        return fetch(url, {
            method: 'GET',
            mode: 'cors',
            headers: {
                'Content-Type': `text/plain;charset=utf-8`,
                // 'Cache-Control': 'no-cache'
            }
        }).then(res=>res.text());
    }
}


module.exports = HttpClient;