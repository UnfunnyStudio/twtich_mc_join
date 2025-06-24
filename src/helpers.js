export const fetchJSON = async (url, options) => {
    const resp = await fetch(url, options);
    return resp.json();
}