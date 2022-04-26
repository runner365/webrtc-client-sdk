
class HttpClient
{
    constructor() {
    }

    Post(url, data) {
        return fetch(url, {
            method: 'POST',
            headers: {
                'Content-Type': `text/plain;charset=utf-8`,
                // 'Cache-Control': 'no-cache'
            },
            body: data
            //headers: {'Content-Type': 'application/json'}
        }).then(res=>res.text());
    }
}


module.exports = HttpClient;