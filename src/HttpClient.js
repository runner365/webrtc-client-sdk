
class HttpClient
{
    constructor() {
    }

    async Post(url, data) {
        return new Promise((resolve, reject) => {
            fetch(url, {
                method: 'POST',
                mode: 'no-cors',
                headers: {
                    'Content-Type': `text/plain;charset=utf-8`,
                    // 'Cache-Control': 'no-cache'
                },
                body: data
                //headers: {'Content-Type': 'application/json'}
            }).then(async (response) => {
                let data = await response.text();
                resolve(data);
            }).catch((error) => {
                reject(error);
            });
        });

    }
}


module.exports = HttpClient;