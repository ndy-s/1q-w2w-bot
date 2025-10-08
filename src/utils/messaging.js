
function getNumber(jid) {
    if (!jid) return "";

    const atIndex = jid.indexOf("@");
    if (atIndex === -1) {
        const colonIndex = jid.indexOf(":");
        return colonIndex === -1 ? jid : jid.slice(0, colonIndex);
    }

    const colonBeforeAt = jid.lastIndexOf(":", atIndex - 1);
    const local = colonBeforeAt === -1 ? jid.slice(0, atIndex) : jid.slice(0, colonBeforeAt);
    const domain = jid.slice(atIndex);
    return local + domain;
}

module.exports = { getNumber };