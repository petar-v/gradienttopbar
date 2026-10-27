const cases = [];

export const assert = (condition, message) => {
    if (!condition)
        throw new Error(message);
};

export const test = (name, body) => cases.push({ name, body });

export const run = () => {
    let failures = 0;
    for (const { name, body } of cases) {
        const cleanup = [];
        const errors = [];
        try {
            body({ after: callback => cleanup.push(callback) });
        } catch (error) {
            errors.push(error);
        }
        for (const callback of cleanup.reverse()) {
            try {
                callback();
            } catch (error) {
                errors.push(error);
            }
        }
        if (errors.length) {
            failures++;
            printerr(`FAIL ${name}`);
            errors.forEach(error => printerr(error.stack ?? String(error)));
        } else {
            print(`PASS ${name}`);
        }
    }
    print(`${cases.length - failures}/${cases.length} tests passed`);
    if (failures)
        throw new Error(`${failures} tests failed`);
};
