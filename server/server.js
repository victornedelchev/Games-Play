(function (global, factory) {
  typeof exports === "object" && typeof module !== "undefined"
    ? (module.exports = factory(
        require("http"),
        require("fs"),
        require("crypto")
      ))
    : typeof define === "function" && define.amd
    ? define(["http", "fs", "crypto"], factory)
    : ((global =
        typeof globalThis !== "undefined" ? globalThis : global || self),
      (global.Server = factory(global.http, global.fs, global.crypto)));
})(this, function (http, fs, crypto) {
  "use strict";

  function _interopDefaultLegacy(e) {
    return e && typeof e === "object" && "default" in e ? e : { default: e };
  }

  var http__default = /*#__PURE__*/ _interopDefaultLegacy(http);
  var fs__default = /*#__PURE__*/ _interopDefaultLegacy(fs);
  var crypto__default = /*#__PURE__*/ _interopDefaultLegacy(crypto);

  class ServiceError extends Error {
    constructor(message = "Service Error") {
      super(message);
      this.name = "ServiceError";
    }
  }

  class NotFoundError extends ServiceError {
    constructor(message = "Resource not found") {
      super(message);
      this.name = "NotFoundError";
      this.status = 404;
    }
  }

  class RequestError extends ServiceError {
    constructor(message = "Request error") {
      super(message);
      this.name = "RequestError";
      this.status = 400;
    }
  }

  class ConflictError extends ServiceError {
    constructor(message = "Resource conflict") {
      super(message);
      this.name = "ConflictError";
      this.status = 409;
    }
  }

  class AuthorizationError extends ServiceError {
    constructor(message = "Unauthorized") {
      super(message);
      this.name = "AuthorizationError";
      this.status = 401;
    }
  }

  class CredentialError extends ServiceError {
    constructor(message = "Forbidden") {
      super(message);
      this.name = "CredentialError";
      this.status = 403;
    }
  }

  var errors = {
    ServiceError,
    NotFoundError,
    RequestError,
    ConflictError,
    AuthorizationError,
    CredentialError,
  };

  const { ServiceError: ServiceError$1 } = errors;

  function createHandler(plugins, services) {
    return async function handler(req, res) {
      const method = req.method;
      console.info(`<< ${req.method} ${req.url}`);

      // Redirect fix for admin panel relative paths
      if (req.url.slice(-6) == "/admin") {
        res.writeHead(302, {
          Location: `http://${req.headers.host}/admin/`,
        });
        return res.end();
      }

      let status = 200;
      let headers = {
        "Access-Control-Allow-Origin": "*",
        "Content-Type": "application/json",
      };
      let result = "";
      let context;

      // NOTE: the OPTIONS method results in undefined result and also it never processes plugins - keep this in mind
      if (method == "OPTIONS") {
        Object.assign(headers, {
          "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
          "Access-Control-Allow-Credentials": false,
          "Access-Control-Max-Age": "86400",
          "Access-Control-Allow-Headers":
            "X-Requested-With, X-HTTP-Method-Override, Content-Type, Accept, X-Authorization, X-Admin",
        });
      } else {
        try {
          context = processPlugins();
          await handle(context);
        } catch (err) {
          if (err instanceof ServiceError$1) {
            status = err.status || 400;
            result = composeErrorObject(err.code || status, err.message);
          } else {
            // Unhandled exception, this is due to an error in the service code - REST consumers should never have to encounter this;
            // If it happens, it must be debugged in a future version of the server
            console.error(err);
            status = 500;
            result = composeErrorObject(500, "Server Error");
          }
        }
      }

      res.writeHead(status, headers);
      if (
        context != undefined &&
        context.util != undefined &&
        context.util.throttle
      ) {
        await new Promise((r) => setTimeout(r, 500 + Math.random() * 500));
      }
      res.end(result);

      function processPlugins() {
        const context = { params: {} };
        plugins.forEach((decorate) => decorate(context, req));
        return context;
      }

      async function handle(context) {
        const { serviceName, tokens, query, body } = await parseRequest(req);
        if (serviceName == "admin") {
          return ({ headers, result } = services["admin"](
            method,
            tokens,
            query,
            body
          ));
        } else if (serviceName == "favicon.ico") {
          return ({ headers, result } = services["favicon"](
            method,
            tokens,
            query,
            body
          ));
        }

        const service = services[serviceName];

        if (service === undefined) {
          status = 400;
          result = composeErrorObject(
            400,
            `Service "${serviceName}" is not supported`
          );
          console.error("Missing service " + serviceName);
        } else {
          result = await service(context, { method, tokens, query, body });
        }

        // NOTE: logout does not return a result
        // in this case the content type header should be omitted, to allow checks on the client
        if (result !== undefined) {
          result = JSON.stringify(result);
        } else {
          status = 204;
          delete headers["Content-Type"];
        }
      }
    };
  }

  function composeErrorObject(code, message) {
    return JSON.stringify({
      code,
      message,
    });
  }

  async function parseRequest(req) {
    const url = new URL(req.url, `http://${req.headers.host}`);
    const tokens = url.pathname.split("/").filter((x) => x.length > 0);
    const serviceName = tokens.shift();
    const queryString = url.search.split("?")[1] || "";
    const query = queryString
      .split("&")
      .filter((s) => s != "")
      .map((x) => x.split("="))
      .reduce(
        (p, [k, v]) => Object.assign(p, { [k]: decodeURIComponent(v) }),
        {}
      );
    const body = await parseBody(req);

    return {
      serviceName,
      tokens,
      query,
      body,
    };
  }

  function parseBody(req) {
    return new Promise((resolve, reject) => {
      let body = "";
      req.on("data", (chunk) => (body += chunk.toString()));
      req.on("end", () => {
        try {
          resolve(JSON.parse(body));
        } catch (err) {
          resolve(body);
        }
      });
    });
  }

  var requestHandler = createHandler;

  class Service {
    constructor() {
      this._actions = [];
      this.parseRequest = this.parseRequest.bind(this);
    }

    /**
     * Handle service request, after it has been processed by a request handler
     * @param {*} context Execution context, contains result of middleware processing
     * @param {{method: string, tokens: string[], query: *, body: *}} request Request parameters
     */
    async parseRequest(context, request) {
      for (let { method, name, handler } of this._actions) {
        if (
          method === request.method &&
          matchAndAssignParams(context, request.tokens[0], name)
        ) {
          return await handler(
            context,
            request.tokens.slice(1),
            request.query,
            request.body
          );
        }
      }
    }

    /**
     * Register service action
     * @param {string} method HTTP method
     * @param {string} name Action name. Can be a glob pattern.
     * @param {(context, tokens: string[], query: *, body: *)} handler Request handler
     */
    registerAction(method, name, handler) {
      this._actions.push({ method, name, handler });
    }

    /**
     * Register GET action
     * @param {string} name Action name. Can be a glob pattern.
     * @param {(context, tokens: string[], query: *, body: *)} handler Request handler
     */
    get(name, handler) {
      this.registerAction("GET", name, handler);
    }

    /**
     * Register POST action
     * @param {string} name Action name. Can be a glob pattern.
     * @param {(context, tokens: string[], query: *, body: *)} handler Request handler
     */
    post(name, handler) {
      this.registerAction("POST", name, handler);
    }

    /**
     * Register PUT action
     * @param {string} name Action name. Can be a glob pattern.
     * @param {(context, tokens: string[], query: *, body: *)} handler Request handler
     */
    put(name, handler) {
      this.registerAction("PUT", name, handler);
    }

    /**
     * Register PATCH action
     * @param {string} name Action name. Can be a glob pattern.
     * @param {(context, tokens: string[], query: *, body: *)} handler Request handler
     */
    patch(name, handler) {
      this.registerAction("PATCH", name, handler);
    }

    /**
     * Register DELETE action
     * @param {string} name Action name. Can be a glob pattern.
     * @param {(context, tokens: string[], query: *, body: *)} handler Request handler
     */
    delete(name, handler) {
      this.registerAction("DELETE", name, handler);
    }
  }

  function matchAndAssignParams(context, name, pattern) {
    if (pattern == "*") {
      return true;
    } else if (pattern[0] == ":") {
      context.params[pattern.slice(1)] = name;
      return true;
    } else if (name == pattern) {
      return true;
    } else {
      return false;
    }
  }

  var Service_1 = Service;

  function uuid() {
    return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(
      /[xy]/g,
      function (c) {
        let r = (Math.random() * 16) | 0,
          v = c == "x" ? r : (r & 0x3) | 0x8;
        return v.toString(16);
      }
    );
  }

  var util = {
    uuid,
  };

  const uuid$1 = util.uuid;

  const data = fs__default["default"].existsSync("./data")
    ? fs__default["default"].readdirSync("./data").reduce((p, c) => {
        const content = JSON.parse(
          fs__default["default"].readFileSync("./data/" + c)
        );
        const collection = c.slice(0, -5);
        p[collection] = {};
        for (let endpoint in content) {
          p[collection][endpoint] = content[endpoint];
        }
        return p;
      }, {})
    : {};

  const actions = {
    get: (context, tokens, query, body) => {
      tokens = [context.params.collection, ...tokens];
      let responseData = data;
      for (let token of tokens) {
        if (responseData !== undefined) {
          responseData = responseData[token];
        }
      }
      return responseData;
    },
    post: (context, tokens, query, body) => {
      tokens = [context.params.collection, ...tokens];
      console.log("Request body:\n", body);

      // TODO handle collisions, replacement
      let responseData = data;
      for (let token of tokens) {
        if (responseData.hasOwnProperty(token) == false) {
          responseData[token] = {};
        }
        responseData = responseData[token];
      }

      const newId = uuid$1();
      responseData[newId] = Object.assign({}, body, { _id: newId });
      return responseData[newId];
    },
    put: (context, tokens, query, body) => {
      tokens = [context.params.collection, ...tokens];
      console.log("Request body:\n", body);

      let responseData = data;
      for (let token of tokens.slice(0, -1)) {
        if (responseData !== undefined) {
          responseData = responseData[token];
        }
      }
      if (
        responseData !== undefined &&
        responseData[tokens.slice(-1)] !== undefined
      ) {
        responseData[tokens.slice(-1)] = body;
      }
      return responseData[tokens.slice(-1)];
    },
    patch: (context, tokens, query, body) => {
      tokens = [context.params.collection, ...tokens];
      console.log("Request body:\n", body);

      let responseData = data;
      for (let token of tokens) {
        if (responseData !== undefined) {
          responseData = responseData[token];
        }
      }
      if (responseData !== undefined) {
        Object.assign(responseData, body);
      }
      return responseData;
    },
    delete: (context, tokens, query, body) => {
      tokens = [context.params.collection, ...tokens];
      let responseData = data;

      for (let i = 0; i < tokens.length; i++) {
        const token = tokens[i];
        if (responseData.hasOwnProperty(token) == false) {
          return null;
        }
        if (i == tokens.length - 1) {
          const body = responseData[token];
          delete responseData[token];
          return body;
        } else {
          responseData = responseData[token];
        }
      }
    },
  };

  const dataService = new Service_1();
  dataService.get(":collection", actions.get);
  dataService.post(":collection", actions.post);
  dataService.put(":collection", actions.put);
  dataService.patch(":collection", actions.patch);
  dataService.delete(":collection", actions.delete);

  var jsonstore = dataService.parseRequest;

  /*
   * This service requires storage and auth plugins
   */

  const { AuthorizationError: AuthorizationError$1 } = errors;

  const userService = new Service_1();

  userService.get("me", getSelf);
  userService.post("register", onRegister);
  userService.post("login", onLogin);
  userService.get("logout", onLogout);

  function getSelf(context, tokens, query, body) {
    if (context.user) {
      const result = Object.assign({}, context.user);
      delete result.hashedPassword;
      return result;
    } else {
      throw new AuthorizationError$1();
    }
  }

  function onRegister(context, tokens, query, body) {
    return context.auth.register(body);
  }

  function onLogin(context, tokens, query, body) {
    return context.auth.login(body);
  }

  function onLogout(context, tokens, query, body) {
    return context.auth.logout();
  }

  var users = userService.parseRequest;

  const { NotFoundError: NotFoundError$1, RequestError: RequestError$1 } =
    errors;

  var crud = {
    get,
    post,
    put,
    patch,
    delete: del,
  };

  function validateRequest(context, tokens, query) {
    /*
        if (context.params.collection == undefined) {
            throw new RequestError('Please, specify collection name');
        }
        */
    if (tokens.length > 1) {
      throw new RequestError$1();
    }
  }

  function parseWhere(query) {
    const operators = {
      "<=": (prop, value) => (record) => record[prop] <= JSON.parse(value),
      "<": (prop, value) => (record) => record[prop] < JSON.parse(value),
      ">=": (prop, value) => (record) => record[prop] >= JSON.parse(value),
      ">": (prop, value) => (record) => record[prop] > JSON.parse(value),
      "=": (prop, value) => (record) => record[prop] == JSON.parse(value),
      " like ": (prop, value) => (record) =>
        record[prop].toLowerCase().includes(JSON.parse(value).toLowerCase()),
      " in ": (prop, value) => (record) =>
        JSON.parse(`[${/\((.+?)\)/.exec(value)[1]}]`).includes(record[prop]),
    };
    const pattern = new RegExp(
      `^(.+?)(${Object.keys(operators).join("|")})(.+?)$`,
      "i"
    );

    try {
      let clauses = [query.trim()];
      let check = (a, b) => b;
      let acc = true;
      if (query.match(/ and /gi)) {
        // inclusive
        clauses = query.split(/ and /gi);
        check = (a, b) => a && b;
        acc = true;
      } else if (query.match(/ or /gi)) {
        // optional
        clauses = query.split(/ or /gi);
        check = (a, b) => a || b;
        acc = false;
      }
      clauses = clauses.map(createChecker);

      return (record) => clauses.map((c) => c(record)).reduce(check, acc);
    } catch (err) {
      throw new Error("Could not parse WHERE clause, check your syntax.");
    }

    function createChecker(clause) {
      let [match, prop, operator, value] = pattern.exec(clause);
      [prop, value] = [prop.trim(), value.trim()];

      return operators[operator.toLowerCase()](prop, value);
    }
  }

  function get(context, tokens, query, body) {
    validateRequest(context, tokens);

    let responseData;

    try {
      if (query.where) {
        responseData = context.storage
          .get(context.params.collection)
          .filter(parseWhere(query.where));
      } else if (context.params.collection) {
        responseData = context.storage.get(
          context.params.collection,
          tokens[0]
        );
      } else {
        // Get list of collections
        return context.storage.get();
      }

      if (query.sortBy) {
        const props = query.sortBy
          .split(",")
          .filter((p) => p != "")
          .map((p) => p.split(" ").filter((p) => p != ""))
          .map(([p, desc]) => ({ prop: p, desc: desc ? true : false }));

        // Sorting priority is from first to last, therefore we sort from last to first
        for (let i = props.length - 1; i >= 0; i--) {
          let { prop, desc } = props[i];
          responseData.sort(({ [prop]: propA }, { [prop]: propB }) => {
            if (typeof propA == "number" && typeof propB == "number") {
              return (propA - propB) * (desc ? -1 : 1);
            } else {
              return propA.localeCompare(propB) * (desc ? -1 : 1);
            }
          });
        }
      }

      if (query.offset) {
        responseData = responseData.slice(Number(query.offset) || 0);
      }
      const pageSize = Number(query.pageSize) || 10;
      if (query.pageSize) {
        responseData = responseData.slice(0, pageSize);
      }

      if (query.distinct) {
        const props = query.distinct.split(",").filter((p) => p != "");
        responseData = Object.values(
          responseData.reduce((distinct, c) => {
            const key = props.map((p) => c[p]).join("::");
            if (distinct.hasOwnProperty(key) == false) {
              distinct[key] = c;
            }
            return distinct;
          }, {})
        );
      }

      if (query.count) {
        return responseData.length;
      }

      if (query.select) {
        const props = query.select.split(",").filter((p) => p != "");
        responseData = Array.isArray(responseData)
          ? responseData.map(transform)
          : transform(responseData);

        function transform(r) {
          const result = {};
          props.forEach((p) => (result[p] = r[p]));
          return result;
        }
      }

      if (query.load) {
        const props = query.load.split(",").filter((p) => p != "");
        props.map((prop) => {
          const [propName, relationTokens] = prop.split("=");
          const [idSource, collection] = relationTokens.split(":");
          console.log(
            `Loading related records from "${collection}" into "${propName}", joined on "_id"="${idSource}"`
          );
          const storageSource =
            collection == "users" ? context.protectedStorage : context.storage;
          responseData = Array.isArray(responseData)
            ? responseData.map(transform)
            : transform(responseData);

          function transform(r) {
            const seekId = r[idSource];
            const related = storageSource.get(collection, seekId);
            delete related.hashedPassword;
            r[propName] = related;
            return r;
          }
        });
      }
    } catch (err) {
      console.error(err);
      if (err.message.includes("does not exist")) {
        throw new NotFoundError$1();
      } else {
        throw new RequestError$1(err.message);
      }
    }

    context.canAccess(responseData);

    return responseData;
  }

  function post(context, tokens, query, body) {
    console.log("Request body:\n", body);

    validateRequest(context, tokens);
    if (tokens.length > 0) {
      throw new RequestError$1("Use PUT to update records");
    }
    context.canAccess(undefined, body);

    body._ownerId = context.user._id;
    let responseData;

    try {
      responseData = context.storage.add(context.params.collection, body);
    } catch (err) {
      throw new RequestError$1();
    }

    return responseData;
  }

  function put(context, tokens, query, body) {
    console.log("Request body:\n", body);

    validateRequest(context, tokens);
    if (tokens.length != 1) {
      throw new RequestError$1("Missing entry ID");
    }

    let responseData;
    let existing;

    try {
      existing = context.storage.get(context.params.collection, tokens[0]);
    } catch (err) {
      throw new NotFoundError$1();
    }

    context.canAccess(existing, body);

    try {
      responseData = context.storage.set(
        context.params.collection,
        tokens[0],
        body
      );
    } catch (err) {
      throw new RequestError$1();
    }

    return responseData;
  }

  function patch(context, tokens, query, body) {
    console.log("Request body:\n", body);

    validateRequest(context, tokens);
    if (tokens.length != 1) {
      throw new RequestError$1("Missing entry ID");
    }

    let responseData;
    let existing;

    try {
      existing = context.storage.get(context.params.collection, tokens[0]);
    } catch (err) {
      throw new NotFoundError$1();
    }

    context.canAccess(existing, body);

    try {
      responseData = context.storage.merge(
        context.params.collection,
        tokens[0],
        body
      );
    } catch (err) {
      throw new RequestError$1();
    }

    return responseData;
  }

  function del(context, tokens, query, body) {
    validateRequest(context, tokens);
    if (tokens.length != 1) {
      throw new RequestError$1("Missing entry ID");
    }

    let responseData;
    let existing;

    try {
      existing = context.storage.get(context.params.collection, tokens[0]);
    } catch (err) {
      throw new NotFoundError$1();
    }

    context.canAccess(existing);

    try {
      responseData = context.storage.delete(
        context.params.collection,
        tokens[0]
      );
    } catch (err) {
      throw new RequestError$1();
    }

    return responseData;
  }

  /*
   * This service requires storage and auth plugins
   */

  const dataService$1 = new Service_1();
  dataService$1.get(":collection", crud.get);
  dataService$1.post(":collection", crud.post);
  dataService$1.put(":collection", crud.put);
  dataService$1.patch(":collection", crud.patch);
  dataService$1.delete(":collection", crud.delete);

  var data$1 = dataService$1.parseRequest;

  const imgdata =
    "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Td4DLneAwSddMiRH8tMU8nng/Yy+KQsM3AKBNbe35j5OH4A0dbV8AxwcAqMFyl73eHd3e2//nmn29wOGi3Kv+RixSgAAEkxpVFh0WE1MOmNvbS5hZG9iZS54bXAAAAAAADw/eHBhY2tldCBiZWdpbj0i77u/IiBpZD0iVzVNME1wQ2VoaUh6cmVTek5UY3prYzlkIj8+Cjx4OnhtcG1ldGEgeG1sbnM6eD0iYWRvYmU6bnM6bWV0YS8iIHg6eG1wdGs9IlhNUCBDb3JlIDQuNC4wLUV4aXYyIj4KIDxyZGY6UkRGIHhtbG5zOnJkZj0iaHR0cDovL3d3dy53My5vcmcvMTk5OS8wMi8yMi1yZGYtc3ludGF4LW5zIyI+CiAgPHJkZjpEZXNjcmlwdGlvbiByZGY6YWJvdXQ9IiIKICAgIHhtbG5zOmlwdGNFeHQ9Imh0dHA6Ly9pcHRjLm9yZy9zdGQvSXB0YzR4bXBFeHQvMjAwOC0wMi0yOS8iCiAgICB4bWxuczp4bXBNTT0iaHR0cDovL25zLmFkb2JlLmNvbS94YXAvMS4wL21tLyIKICAgIHhtbG5zOnN0RXZ0PSJodHRwOi8vbnMuYWRvYmUuY29tL3hhcC8xLjAvc1R5cGUvUmVzb3VyY2VFdmVudCMiCiAgICB4bWxuczpwbHVzPSJodHRwOi8vbnMudXNlcGx1cy5vcmcvbGRmL3htcC8xLjAvIgogICAgeG1sbnM6R0lNUD0iaHR0cDovL3d3dy5naW1wLm9yZy94bXAvIgogICAgeG1sbnM6ZGM9Imh0dHA6Ly9wdXJsLm9yZy9kYy9lbGVtZW50cy8xLjEvIgogICAgeG1sbnM6cGhvdG9zaG9wPSJodHRwOi8vbnMuYWRvYmUuY29tL3Bob3Rvc2hvcC8xLjAvIgogICAgeG1sbnM6eG1wPSJodHRwOi8vbnMuYWRvYmUuY29tL3hhcC8xLjAvIgogICAgeG1sbnM6eG1wUmlnaHRzPSJodHRwOi8vbnMuYWRvYmUuY29tL3hhcC8xLjAvcmlnaHRzLyIKICAgeG1wTU06RG9jdW1lbnRJRD0iZ2ltcDpkb2NpZDpnaW1wOjdjZDM3NWM3LTcwNmItNDlkMy1hOWRkLWNmM2Q3MmMwY2I4ZCIKICAgeG1wTU06SW5zdGFuY2VJRD0ieG1wLmlpZDo2NGY2YTJlYy04ZjA5LTRkZTMtOTY3ZC05MTUyY2U5NjYxNTAiCiAgIHhtcE1NOk9yaWdpbmFsRG9jdW1lbnRJRD0ieG1wLmRpZDoxMmE1NzI5Mi1kNmJkLTRlYjQtOGUxNi1hODEzYjMwZjU0NWYiCiAgIEdJTVA6QVBJPSIyLjAiCiAgIEdJTVA6UGxhdGZvcm09IldpbmRvd3MiCiAgIEdJTVA6VGltZVN0YW1wPSIxNjEzMzAwNzI5NTMwNjQzIgogICBHSU1QOlZlcnNpb249IjIuMTAuMTIiCiAgIGRjOkZvcm1hdD0iaW1hZ2UvcG5nIgogICBwaG90b3Nob3A6Q3JlZGl0PSJHZXR0eSBJbWFnZXMvaVN0b2NrcGhvdG8iCiAgIHhtcDpDcmVhdG9yVG9vbD0iR0lNUCAyLjEwIgogICB4bXBSaWdodHM6V2ViU3RhdGVtZW50PSJodHRwczovL3d3dy5pc3RvY2twaG90by5jb20vbGVnYWwvbGljZW5zZS1hZ3JlZW1lbnQ/dXRtX21lZGl1bT1vcmdhbmljJmFtcDt1dG1fc291cmNlPWdvb2dsZSZhbXA7dXRtX2NhbXBhaWduPWlwdGN1cmwiPgogICA8aXB0Y0V4dDpMb2NhdGlvbkNyZWF0ZWQ+CiAgICA8cmRmOkJhZy8+CiAgIDwvaXB0Y0V4dDpMb2NhdGlvbkNyZWF0ZWQ+CiAgIDxpcHRjRXh0OkxvY2F0aW9uU2hvd24+CiAgICA8cmRmOkJhZy8+CiAgIDwvaXB0Y0V4dDpMb2NhdGlvblNob3duPgogICA8aXB0Y0V4dDpBcnR3b3JrT3JPYmplY3Q+CiAgICA8cmRmOkJhZy8+CiAgIDwvaXB0Y0V4dDpBcnR3b3JrT3JPYmplY3Q+CiAgIDxpcHRjRXh0OlJlZ2lzdHJ5SWQ+CiAgICA8cmRmOkJhZy8+CiAgIDwvaXB0Y0V4dDpSZWdpc3RyeUlkPgogICA8eG1wTU06SGlzdG9yeT4KICAgIDxyZGY6U2VxPgogICAgIDxyZGY6bGkKICAgICAgc3RFdnQ6YWN0aW9uPSJzYXZlZCIKICAgICAgc3RFdnQ6Y2hhbmdlZD0iLyIKICAgICAgc3RFdnQ6aW5zdGFuY2VJRD0ieG1wLmlpZDpjOTQ2M2MxMC05OWE4LTQ1NDQtYmRlOS1mNzY0ZjdhODJlZDkiCiAgICAgIHN0RXZ0OnNvZnR3YXJlQWdlbnQ9IkdpbXAgMi4xMCAoV2luZG93cykiCiAgICAgIHN0RXZ0OndoZW49IjIwMjEtMDItMTRUMTM6MDU6MjkiLz4KICAgIDwvcmRmOlNlcT4KICAgPC94bXBNTTpIaXN0b3J5PgogICA8cGx1czpJbWFnZVN1cHBsaWVyPgogICAgPHJkZjpTZXEvPgogICA8L3BsdXM6SW1hZ2VTdXBwbGllcj4KICAgPHBsdXM6SW1hZ2VDcmVhdG9yPgogICAgPHJkZjpTZXEvPgogICA8L3BsdXM6SW1hZ2VDcmVhdG9yPgogICA8cGx1czpDb3B5cmlnaHRPd25lcj4KICAgIDxyZGY6U2VxLz4KICAgPC9wbHVzOkNvcHlyaWdodE93bmVyPgogICA8cGx1czpMaWNlbnNvcj4KICAgIDxyZGY6U2VxPgogICAgIDxyZGY6bGkKICAgICAgcGx1czpMaWNlbnNvclVSTD0iaHR0cHM6Ly93d3cuaXN0b2NrcGhvdG8uY29tL3Bob3RvL2xpY2Vuc2UtZ20xMTUwMzQ1MzQxLT91dG1fbWVkaXVtPW9yZ2FuaWMmYW1wO3V0bV9zb3VyY2U9Z29vZ2xlJmFtcDt1dG1fY2FtcGFpZ249aXB0Y3VybCIvPgogICAgPC9yZGY6U2VxPgogICA8L3BsdXM6TGljZW5zb3I+CiAgIDxkYzpjcmVhdG9yPgogICAgPHJkZjpTZXE+CiAgICAgPHJkZjpsaT5WbGFkeXNsYXYgU2VyZWRhPC9yZGY6bGk+CiAgICA8L3JkZjpTZXE+CiAgIDwvZGM6Y3JlYXRvcj4KICAgPGRjOmRlc2NyaXB0aW9uPgogICAgPHJkZjpBbHQ+CiAgICAgPHJkZjpsaSB4bWw6bGFuZz0ieC1kZWZhdWx0Ij5TZXJ2aWNlIHRvb2xzIGljb24gb24gd2hpdGUgYmFja2dyb3VuZC4gVmVjdG9yIGlsbHVzdHJhdGlvbi48L3JkZjpsaT4KICAgIDwvcmRmOkFsdD4KICAgPC9kYzpkZXNjcmlwdGlvbj4KICA8L3JkZjpEZXNjcmlwdGlvbj4KIDwvcmRmOlJERj4KPC94OnhtcG1ldGE+CiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAKICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIAogICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgCiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAKICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIAogICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgCiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAKICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIAogICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgCiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAKICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIAogICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgCiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAKICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIAogICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgCiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAKICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIAogICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgCiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAKICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIAogICAgICAgICAgICAgICAgICAgICAgICAgICAKPD94cGFja2V0IGVuZD0idyI/PmWJCnkAAAAGYktHRAD/AP8A/6C9p5MAAAAJcEhZcwAALiMAAC4jAXilP3YAAAAHdElNRQflAg4LBR0CZnO/AAAARHRFWHRDb21tZW50AFNlcnZpY2UgdG9vbHMgaWNvbiBvbiB3aGl0ZSBiYWNrZ3JvdW5kLiBWZWN0b3IgaWxsdXN0cmF0aW9uLlwvEeIAAAMxSURBVHja7Z1bcuQwCEX7qrLQXlp2ynxNVWbK7dgWj3sl9JvYRhxACD369erW7UMzx/cYaychonAQvXM5ABYkpynoYIiEGdoQog6AYfywBrCxF4zNrX/7McBbuXJe8rXx/KBDULcGsMREzCbeZ4J6ME/9wVH5d95rogZp3npEgPLP3m2iUSGqXBJS5Dr6hmLm8kRuZABYti5TMaailV8LodNQwTTUWk4/WZk75l0kM0aZQdaZjMqkrQDAuyMVJWFjMB4GANXr0lbZBxQKr7IjI7QvVWkok/Jn5UHVh61CYPs+/i7eL9j3y/Au8WqoAIC34k8/9k7N8miLcaGWHwgjZXE/awyYX7h41wKMCskZM2HXAddDkTdglpSjz5bcKPbcCEKwT3+DhxtVpJvkEC7rZSgq32NMSBoXaCdiahDCKrND0fpX8oQlVsQ8IFQZ1VARdIF5wroekAjB07gsAgDUIbQHFENIDEX4CQANIVe8Iw/ASiACLXl28eaf579OPuBa9/mrELUYHQ1t3KHlZZnRcXb2/c7ygXIQZqjDMEzeSrOgCAhqYMvTUE+FKXoVxTxgk3DEPREjGzj3nAk/VaKyB9GVIu4oMyOlrQZgrBBEFG9PAZTfs3amYDGrP9Wl964IeFvtz9JFluIvlEvcdoXDOdxggbDxGwTXcxFRi/LdirKgZUBm7SUdJG69IwSUzAMWgOAq/4hyrZVaJISSNWHFVbEoCFEhyBrCtXS9L+so9oTy8wGqxbQDD350WTjNESVFEB5hdKzUGcV5QtYxVWR2Ssl4Mg9qI9u6FCBInJRXgfEEgtS9Cgrg7kKouq4mdcDNBnEHQvWFTdgdgsqP+MiluVeBM13ahx09AYSWi50gsF+I6vn7BmCEoHR3NBzkpIOw4+XdVBBGQUioblaZHbGlodtB+N/jxqwLX/x/NARfD8ADxTOCKIcwE4Lw0OIbguMYcGTlymEpHYLXIKx8zQEqIfS2lGJPaADFEBR/PMH79ErqtpnZmTBlvM4wgihPWDEEhXn1LISj50crNgfCp+dWHYQRCfb2zgfnBZmKGAyi914anK9Coi4LOMhoAn3uVtn+AGnLKxPUZnCuAAAAAElFTkSuQmCC";
  const img = Buffer.from(imgdata, "base64");

  var favicon = (method, tokens, query, body) => {
    console.log("serving favicon...");
    const headers = {
      "Content-Type": "image/png",
      "Content-Length": img.length,
    };
    let result = img;

    return {
      headers,
      result,
    };
  };

  var require$$0 =
    '<!DOCTYPE html>\r\n<html lang="en">\r\n<head>\r\n    <meta charset="UTF-8">\r\n    <meta http-equiv="X-UA-Compatible" content="IE=edge">\r\n    <meta name="viewport" content="width=device-width, initial-scale=1.0">\r\n    <title>SUPS Admin Panel</title>\r\n    <style>\r\n        * {\r\n            padding: 0;\r\n            margin: 0;\r\n        }\r\n\r\n        body {\r\n            padding: 32px;\r\n            font-size: 16px;\r\n        }\r\n\r\n        .layout::after {\r\n            content: \'\';\r\n            clear: both;\r\n            display: table;\r\n        }\r\n\r\n        .col {\r\n            display: block;\r\n            float: left;\r\n        }\r\n\r\n        p {\r\n            padding: 8px 16px;\r\n        }\r\n\r\n        table {\r\n            border-collapse: collapse;\r\n        }\r\n\r\n        caption {\r\n            font-size: 120%;\r\n            text-align: left;\r\n            padding: 4px 8px;\r\n            font-weight: bold;\r\n            background-color: #ddd;\r\n        }\r\n\r\n        table, tr, th, td {\r\n            border: 1px solid #ddd;\r\n        }\r\n\r\n        th, td {\r\n            padding: 4px 8px;\r\n        }\r\n\r\n        ul {\r\n            list-style: none;\r\n        }\r\n\r\n        .collection-list a {\r\n            display: block;\r\n            width: 120px;\r\n            padding: 4px 8px;\r\n            text-decoration: none;\r\n            color: black;\r\n            background-color: #ccc;\r\n        }\r\n        .collection-list a:hover {\r\n            background-color: #ddd;\r\n        }\r\n        .collection-list a:visited {\r\n            color: black;\r\n        }\r\n    </style>\r\n    <script type="module">\nimport { html, render } from \'https://unpkg.com/lit-html@1.3.0?module\';\nimport { until } from \'https://unpkg.com/lit-html@1.3.0/directives/until?module\';\n\nconst api = {\r\n    async get(url) {\r\n        return json(url);\r\n    },\r\n    async post(url, body) {\r\n        return json(url, {\r\n            method: \'POST\',\r\n            headers: { \'Content-Type\': \'application/json\' },\r\n            body: JSON.stringify(body)\r\n        });\r\n    }\r\n};\r\n\r\nasync function json(url, options) {\r\n    return await (await fetch(\'/\' + url, options)).json();\r\n}\r\n\r\nasync function getCollections() {\r\n    return api.get(\'data\');\r\n}\r\n\r\nasync function getRecords(collection) {\r\n    return api.get(\'data/\' + collection);\r\n}\r\n\r\nasync function getThrottling() {\r\n    return api.get(\'util/throttle\');\r\n}\r\n\r\nasync function setThrottling(throttle) {\r\n    return api.post(\'util\', { throttle });\r\n}\n\nasync function collectionList(onSelect) {\r\n    const collections = await getCollections();\r\n\r\n    return html`\r\n    <ul class="collection-list">\r\n        ${collections.map(collectionLi)}\r\n    </ul>`;\r\n\r\n    function collectionLi(name) {\r\n        return html`<li><a href="javascript:void(0)" @click=${(ev) => onSelect(ev, name)}>${name}</a></li>`;\r\n    }\r\n}\n\nasync function recordTable(collectionName) {\r\n    const records = await getRecords(collectionName);\r\n    const layout = getLayout(records);\r\n\r\n    return html`\r\n    <table>\r\n        <caption>${collectionName}</caption>\r\n        <thead>\r\n            <tr>${layout.map(f => html`<th>${f}</th>`)}</tr>\r\n        </thead>\r\n        <tbody>\r\n            ${records.map(r => recordRow(r, layout))}\r\n        </tbody>\r\n    </table>`;\r\n}\r\n\r\nfunction getLayout(records) {\r\n    const result = new Set([\'_id\']);\r\n    records.forEach(r => Object.keys(r).forEach(k => result.add(k)));\r\n\r\n    return [...result.keys()];\r\n}\r\n\r\nfunction recordRow(record, layout) {\r\n    return html`\r\n    <tr>\r\n        ${layout.map(f => html`<td>${JSON.stringify(record[f]) || html`<span>(missing)</span>`}</td>`)}\r\n    </tr>`;\r\n}\n\nasync function throttlePanel(display) {\r\n    const active = await getThrottling();\r\n\r\n    return html`\r\n    <p>\r\n        Request throttling: </span>${active}</span>\r\n        <button @click=${(ev) => set(ev, true)}>Enable</button>\r\n        <button @click=${(ev) => set(ev, false)}>Disable</button>\r\n    </p>`;\r\n\r\n    async function set(ev, state) {\r\n        ev.target.disabled = true;\r\n        await setThrottling(state);\r\n        display();\r\n    }\r\n}\n\n//import page from \'//unpkg.com/page/page.mjs\';\r\n\r\n\r\nfunction start() {\r\n    const main = document.querySelector(\'main\');\r\n    editor(main);\r\n}\r\n\r\nasync function editor(main) {\r\n    let list = html`<div class="col">Loading&hellip;</div>`;\r\n    let viewer = html`<div class="col">\r\n    <p>Select collection to view records</p>\r\n</div>`;\r\n    display();\r\n\r\n    list = html`<div class="col">${await collectionList(onSelect)}</div>`;\r\n    display();\r\n\r\n    async function display() {\r\n        render(html`\r\n        <section class="layout">\r\n            ${until(throttlePanel(display), html`<p>Loading</p>`)}\r\n        </section>\r\n        <section class="layout">\r\n            ${list}\r\n            ${viewer}\r\n        </section>`, main);\r\n    }\r\n\r\n    async function onSelect(ev, name) {\r\n        ev.preventDefault();\r\n        viewer = html`<div class="col">${await recordTable(name)}</div>`;\r\n        display();\r\n    }\r\n}\r\n\r\nstart();\n\n</script>\r\n</head>\r\n<body>\r\n    <main>\r\n        Loading&hellip;\r\n    </main>\r\n</body>\r\n</html>';

  const mode = process.argv[2] == "-dev" ? "dev" : "prod";

  const files = {
    index:
      mode == "prod"
        ? require$$0
        : fs__default["default"].readFileSync("./client/index.html", "utf-8"),
  };

  var admin = (method, tokens, query, body) => {
    const headers = {
      "Content-Type": "text/html",
    };
    let result = "";

    const resource = tokens.join("/");
    if (resource && resource.split(".").pop() == "js") {
      headers["Content-Type"] = "application/javascript";

      files[resource] =
        files[resource] ||
        fs__default["default"].readFileSync("./client/" + resource, "utf-8");
      result = files[resource];
    } else {
      result = files.index;
    }

    return {
      headers,
      result,
    };
  };

  /*
   * This service requires util plugin
   */

  const utilService = new Service_1();

  utilService.post("*", onRequest);
  utilService.get(":service", getStatus);

  function getStatus(context, tokens, query, body) {
    return context.util[context.params.service];
  }

  function onRequest(context, tokens, query, body) {
    Object.entries(body).forEach(([k, v]) => {
      console.log(`${k} ${v ? "enabled" : "disabled"}`);
      context.util[k] = v;
    });
    return "";
  }

  var util$1 = utilService.parseRequest;

  var services = {
    jsonstore,
    users,
    data: data$1,
    favicon,
    admin,
    util: util$1,
  };

  const { uuid: uuid$2 } = util;

  function initPlugin(settings) {
    const storage = createInstance(settings.seedData);
    const protectedStorage = createInstance(settings.protectedData);

    return function decoreateContext(context, request) {
      context.storage = storage;
      context.protectedStorage = protectedStorage;
    };
  }

  /**
   * Create storage instance and populate with seed data
   * @param {Object=} seedData Associative array with data. Each property is an object with properties in format {key: value}
   */
  function createInstance(seedData = {}) {
    const collections = new Map();

    // Initialize seed data from file
    for (let collectionName in seedData) {
      if (seedData.hasOwnProperty(collectionName)) {
        const collection = new Map();
        for (let recordId in seedData[collectionName]) {
          if (seedData.hasOwnProperty(collectionName)) {
            collection.set(recordId, seedData[collectionName][recordId]);
          }
        }
        collections.set(collectionName, collection);
      }
    }

    // Manipulation

    /**
     * Get entry by ID or list of all entries from collection or list of all collections
     * @param {string=} collection Name of collection to access. Throws error if not found. If omitted, returns list of all collections.
     * @param {number|string=} id ID of requested entry. Throws error if not found. If omitted, returns of list all entries in collection.
     * @return {Object} Matching entry.
     */
    function get(collection, id) {
      if (!collection) {
        return [...collections.keys()];
      }
      if (!collections.has(collection)) {
        throw new ReferenceError("Collection does not exist: " + collection);
      }
      const targetCollection = collections.get(collection);
      if (!id) {
        const entries = [...targetCollection.entries()];
        let result = entries.map(([k, v]) => {
          return Object.assign(deepCopy(v), { _id: k });
        });
        return result;
      }
      if (!targetCollection.has(id)) {
        throw new ReferenceError("Entry does not exist: " + id);
      }
      const entry = targetCollection.get(id);
      return Object.assign(deepCopy(entry), { _id: id });
    }

    /**
     * Add new entry to collection. ID will be auto-generated
     * @param {string} collection Name of collection to access. If the collection does not exist, it will be created.
     * @param {Object} data Value to store.
     * @return {Object} Original value with resulting ID under _id property.
     */
    function add(collection, data) {
      const record = assignClean({ _ownerId: data._ownerId }, data);

      let targetCollection = collections.get(collection);
      if (!targetCollection) {
        targetCollection = new Map();
        collections.set(collection, targetCollection);
      }
      let id = uuid$2();
      // Make sure new ID does not match existing value
      while (targetCollection.has(id)) {
        id = uuid$2();
      }

      record._createdOn = Date.now();
      targetCollection.set(id, record);
      return Object.assign(deepCopy(record), { _id: id });
    }

    /**
     * Replace entry by ID
     * @param {string} collection Name of collection to access. Throws error if not found.
     * @param {number|string} id ID of entry to update. Throws error if not found.
     * @param {Object} data Value to store. Record will be replaced!
     * @return {Object} Updated entry.
     */
    function set(collection, id, data) {
      if (!collections.has(collection)) {
        throw new ReferenceError("Collection does not exist: " + collection);
      }
      const targetCollection = collections.get(collection);
      if (!targetCollection.has(id)) {
        throw new ReferenceError("Entry does not exist: " + id);
      }

      const existing = targetCollection.get(id);
      const record = assignSystemProps(deepCopy(data), existing);
      record._updatedOn = Date.now();
      targetCollection.set(id, record);
      return Object.assign(deepCopy(record), { _id: id });
    }

    /**
     * Modify entry by ID
     * @param {string} collection Name of collection to access. Throws error if not found.
     * @param {number|string} id ID of entry to update. Throws error if not found.
     * @param {Object} data Value to store. Shallow merge will be performed!
     * @return {Object} Updated entry.
     */
    function merge(collection, id, data) {
      if (!collections.has(collection)) {
        throw new ReferenceError("Collection does not exist: " + collection);
      }
      const targetCollection = collections.get(collection);
      if (!targetCollection.has(id)) {
        throw new ReferenceError("Entry does not exist: " + id);
      }

      const existing = deepCopy(targetCollection.get(id));
      const record = assignClean(existing, data);
      record._updatedOn = Date.now();
      targetCollection.set(id, record);
      return Object.assign(deepCopy(record), { _id: id });
    }

    /**
     * Delete entry by ID
     * @param {string} collection Name of collection to access. Throws error if not found.
     * @param {number|string} id ID of entry to update. Throws error if not found.
     * @return {{_deletedOn: number}} Server time of deletion.
     */
    function del(collection, id) {
      if (!collections.has(collection)) {
        throw new ReferenceError("Collection does not exist: " + collection);
      }
      const targetCollection = collections.get(collection);
      if (!targetCollection.has(id)) {
        throw new ReferenceError("Entry does not exist: " + id);
      }
      targetCollection.delete(id);

      return { _deletedOn: Date.now() };
    }

    /**
     * Search in collection by query object
     * @param {string} collection Name of collection to access. Throws error if not found.
     * @param {Object} query Query object. Format {prop: value}.
     * @return {Object[]} Array of matching entries.
     */
    function query(collection, query) {
      if (!collections.has(collection)) {
        throw new ReferenceError("Collection does not exist: " + collection);
      }
      const targetCollection = collections.get(collection);
      const result = [];
      // Iterate entries of target collection and compare each property with the given query
      for (let [key, entry] of [...targetCollection.entries()]) {
        let match = true;
        for (let prop in entry) {
          if (query.hasOwnProperty(prop)) {
            const targetValue = query[prop];
            // Perform lowercase search, if value is string
            if (
              typeof targetValue === "string" &&
              typeof entry[prop] === "string"
            ) {
              if (
                targetValue.toLocaleLowerCase() !==
                entry[prop].toLocaleLowerCase()
              ) {
                match = false;
                break;
              }
            } else if (targetValue != entry[prop]) {
              match = false;
              break;
            }
          }
        }

        if (match) {
          result.push(Object.assign(deepCopy(entry), { _id: key }));
        }
      }

      return result;
    }

    return { get, add, set, merge, delete: del, query };
  }

  function assignSystemProps(target, entry, ...rest) {
    const whitelist = ["_id", "_createdOn", "_updatedOn", "_ownerId"];
    for (let prop of whitelist) {
      if (entry.hasOwnProperty(prop)) {
        target[prop] = deepCopy(entry[prop]);
      }
    }
    if (rest.length > 0) {
      Object.assign(target, ...rest);
    }

    return target;
  }

  function assignClean(target, entry, ...rest) {
    const blacklist = ["_id", "_createdOn", "_updatedOn", "_ownerId"];
    for (let key in entry) {
      if (blacklist.includes(key) == false) {
        target[key] = deepCopy(entry[key]);
      }
    }
    if (rest.length > 0) {
      Object.assign(target, ...rest);
    }

    return target;
  }

  function deepCopy(value) {
    if (Array.isArray(value)) {
      return value.map(deepCopy);
    } else if (typeof value == "object") {
      return [...Object.entries(value)].reduce(
        (p, [k, v]) => Object.assign(p, { [k]: deepCopy(v) }),
        {}
      );
    } else {
      return value;
    }
  }

  var storage = initPlugin;

  const {
    ConflictError: ConflictError$1,
    CredentialError: CredentialError$1,
    RequestError: RequestError$2,
  } = errors;

  function initPlugin$1(settings) {
    const identity = settings.identity;

    return function decorateContext(context, request) {
      context.auth = {
        register,
        login,
        logout,
      };

      const userToken = request.headers["x-authorization"];
      if (userToken !== undefined) {
        let user;
        const session = findSessionByToken(userToken);
        if (session !== undefined) {
          const userData = context.protectedStorage.get(
            "users",
            session.userId
          );
          if (userData !== undefined) {
            console.log("Authorized as " + userData[identity]);
            user = userData;
          }
        }
        if (user !== undefined) {
          context.user = user;
        } else {
          throw new CredentialError$1("Invalid access token");
        }
      }

      function register(body) {
        if (
          body.hasOwnProperty(identity) === false ||
          body.hasOwnProperty("password") === false ||
          body[identity].length == 0 ||
          body.password.length == 0
        ) {
          throw new RequestError$2("Missing fields");
        } else if (
          context.protectedStorage.query("users", {
            [identity]: body[identity],
          }).length !== 0
        ) {
          throw new ConflictError$1(
            `A user with the same ${identity} already exists`
          );
        } else {
          const newUser = Object.assign({}, body, {
            [identity]: body[identity],
            hashedPassword: hash(body.password),
          });
          const result = context.protectedStorage.add("users", newUser);
          delete result.hashedPassword;

          const session = saveSession(result._id);
          result.accessToken = session.accessToken;

          return result;
        }
      }

      function login(body) {
        const targetUser = context.protectedStorage.query("users", {
          [identity]: body[identity],
        });
        if (targetUser.length == 1) {
          if (hash(body.password) === targetUser[0].hashedPassword) {
            const result = targetUser[0];
            delete result.hashedPassword;

            const session = saveSession(result._id);
            result.accessToken = session.accessToken;

            return result;
          } else {
            throw new CredentialError$1("Login or password don't match");
          }
        } else {
          throw new CredentialError$1("Login or password don't match");
        }
      }

      function logout() {
        if (context.user !== undefined) {
          const session = findSessionByUserId(context.user._id);
          if (session !== undefined) {
            context.protectedStorage.delete("sessions", session._id);
          }
        } else {
          throw new CredentialError$1("User session does not exist");
        }
      }

      function saveSession(userId) {
        let session = context.protectedStorage.add("sessions", { userId });
        const accessToken = hash(session._id);
        session = context.protectedStorage.set(
          "sessions",
          session._id,
          Object.assign({ accessToken }, session)
        );
        return session;
      }

      function findSessionByToken(userToken) {
        return context.protectedStorage.query("sessions", {
          accessToken: userToken,
        })[0];
      }

      function findSessionByUserId(userId) {
        return context.protectedStorage.query("sessions", { userId })[0];
      }
    };
  }

  const secret = "This is not a production server";

  function hash(string) {
    const hash = crypto__default["default"].createHmac("sha256", secret);
    hash.update(string);
    return hash.digest("hex");
  }

  var auth = initPlugin$1;

  function initPlugin$2(settings) {
    const util = {
      throttle: false,
    };

    return function decoreateContext(context, request) {
      context.util = util;
    };
  }

  var util$2 = initPlugin$2;

  /*
   * This plugin requires auth and storage plugins
   */

  const {
    RequestError: RequestError$3,
    ConflictError: ConflictError$2,
    CredentialError: CredentialError$2,
    AuthorizationError: AuthorizationError$2,
  } = errors;

  function initPlugin$3(settings) {
    const actions = {
      GET: ".read",
      POST: ".create",
      PUT: ".update",
      PATCH: ".update",
      DELETE: ".delete",
    };
    const rules = Object.assign(
      {
        "*": {
          ".create": ["User"],
          ".update": ["Owner"],
          ".delete": ["Owner"],
        },
      },
      settings.rules
    );

    return function decorateContext(context, request) {
      // special rules (evaluated at run-time)
      const get = (collectionName, id) => {
        return context.storage.get(collectionName, id);
      };
      const isOwner = (user, object) => {
        return user._id == object._ownerId;
      };
      context.rules = {
        get,
        isOwner,
      };
      const isAdmin = request.headers.hasOwnProperty("x-admin");

      context.canAccess = canAccess;

      function canAccess(data, newData) {
        const user = context.user;
        const action = actions[request.method];
        let { rule, propRules } = getRule(
          action,
          context.params.collection,
          data
        );

        if (Array.isArray(rule)) {
          rule = checkRoles(rule, data);
        } else if (typeof rule == "string") {
          rule = !!eval(rule);
        }
        if (!rule && !isAdmin) {
          throw new CredentialError$2();
        }
        propRules.map((r) => applyPropRule(action, r, user, data, newData));
      }

      function applyPropRule(action, [prop, rule], user, data, newData) {
        // NOTE: user needs to be in scope for eval to work on certain rules
        if (typeof rule == "string") {
          rule = !!eval(rule);
        }

        if (rule == false) {
          if (action == ".create" || action == ".update") {
            delete newData[prop];
          } else if (action == ".read") {
            delete data[prop];
          }
        }
      }

      function checkRoles(roles, data, newData) {
        if (roles.includes("Guest")) {
          return true;
        } else if (!context.user && !isAdmin) {
          throw new AuthorizationError$2();
        } else if (roles.includes("User")) {
          return true;
        } else if (context.user && roles.includes("Owner")) {
          return context.user._id == data._ownerId;
        } else {
          return false;
        }
      }
    };

    function getRule(action, collection, data = {}) {
      let currentRule = ruleOrDefault(true, rules["*"][action]);
      let propRules = [];

      // Top-level rules for the collection
      const collectionRules = rules[collection];
      if (collectionRules !== undefined) {
        // Top-level rule for the specific action for the collection
        currentRule = ruleOrDefault(currentRule, collectionRules[action]);

        // Prop rules
        const allPropRules = collectionRules["*"];
        if (allPropRules !== undefined) {
          propRules = ruleOrDefault(
            propRules,
            getPropRule(allPropRules, action)
          );
        }

        // Rules by record id
        const recordRules = collectionRules[data._id];
        if (recordRules !== undefined) {
          currentRule = ruleOrDefault(currentRule, recordRules[action]);
          propRules = ruleOrDefault(
            propRules,
            getPropRule(recordRules, action)
          );
        }
      }

      return {
        rule: currentRule,
        propRules,
      };
    }

    function ruleOrDefault(current, rule) {
      return rule === undefined || rule.length === 0 ? current : rule;
    }

    function getPropRule(record, action) {
      const props = Object.entries(record)
        .filter(([k]) => k[0] != ".")
        .filter(([k, v]) => v.hasOwnProperty(action))
        .map(([k, v]) => [k, v[action]]);

      return props;
    }
  }

  var rules = initPlugin$3;

  var identity = "email";
  var protectedData = {
    users: {
      "35c62d76-8152-4626-8712-eeb96381bea8": {
        email: "peter@abv.bg",
        username: "Peter",
        hashedPassword:
          "83313014ed3e2391aa1332615d2f053cf5c1bfe05ca1cbcb5582443822df6eb1",
      },
      "847ec027-f659-4086-8032-5173e2f9c93a": {
        email: "george@abv.bg",
        username: "George",
        hashedPassword:
          "83313014ed3e2391aa1332615d2f053cf5c1bfe05ca1cbcb5582443822df6eb1",
      },
      "60f0cf0b-34b0-4abd-9769-8c42f830dffc": {
        email: "admin@abv.bg",
        username: "Admin",
        hashedPassword:
          "fac7060c3e17e6f151f247eacb2cd5ae80b8c36aedb8764e18a41bbdc16aa302",
      },
    },
    sessions: {},
  };
  var seedData = {
    games: {
      "1c32eb6f-66d7-41fc-841f-ec06b1349a5d": {
        _ownerId: "58aa8cb9-bc60-42a3-b877-c3a5b89f89a1",
        title: "World of Warcraft",
        category: "Strategy",
        maxLevel: "50",
        imageUrl:
          "data:image/jpeg;base64,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",
        summary:
          "Similar to other MMORPGs, the game allows players to create a character avatar and explore an open game world in third- or first-person view, exploring the landscape, fighting various monsters, completing quests, and interacting with non-player characters (NPCs) or other players.",
        _createdOn: 1722172366344,
        _id: "1c32eb6f-66d7-41fc-841f-ec06b1349a5d",
      },
      "d1044b78-7425-4811-8d0a-f59ec00118fb": {
        _ownerId: "9c7292cb-2b68-4c53-bd6f-d4c71b6dcf1c",
        title: "Satisfactory",
        category: "Building",
        maxLevel: "10",
        imageUrl:
          "data:image/jpeg;base64,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",
        summary:
          "Satisfactory is a first-person open-world factory building game with a dash of exploration and combat. Play alone or with friends, explore an alien planet, create multi-story factories, and enter conveyor belt heaven!",
        _createdOn: 1722356433586,
        _id: "d1044b78-7425-4811-8d0a-f59ec00118fb",
      },
    },
    recipes: {
      "3987279d-0ad4-4afb-8ca9-5b256ae3b298": {
        _ownerId: "35c62d76-8152-4626-8712-eeb96381bea8",
        name: "Easy Lasagna",
        img: "assets/lasagna.jpg",
        ingredients: [
          "1 tbsp Ingredient 1",
          "2 cups Ingredient 2",
          "500 g  Ingredient 3",
          "25 g Ingredient 4",
        ],
        steps: ["Prepare ingredients", "Mix ingredients", "Cook until done"],
        _createdOn: 1613551279012,
      },
      "8f414b4f-ab39-4d36-bedb-2ad69da9c830": {
        _ownerId: "35c62d76-8152-4626-8712-eeb96381bea8",
        name: "Grilled Duck Fillet",
        img: "assets/roast.jpg",
        ingredients: [
          "500 g  Ingredient 1",
          "3 tbsp Ingredient 2",
          "2 cups Ingredient 3",
        ],
        steps: ["Prepare ingredients", "Mix ingredients", "Cook until done"],
        _createdOn: 1613551344360,
      },
      "985d9eab-ad2e-4622-a5c8-116261fb1fd2": {
        _ownerId: "847ec027-f659-4086-8032-5173e2f9c93a",
        name: "Roast Trout",
        img: "assets/fish.jpg",
        ingredients: [
          "4 cups Ingredient 1",
          "1 tbsp Ingredient 2",
          "1 tbsp Ingredient 3",
          "750 g  Ingredient 4",
          "25 g Ingredient 5",
        ],
        steps: ["Prepare ingredients", "Mix ingredients", "Cook until done"],
        _createdOn: 1613551388703,
      },
    },
    comments: {
      "0a272c58-b7ea-4e09-a000-7ec988248f66": {
        _ownerId: "35c62d76-8152-4626-8712-eeb96381bea8",
        content: "Great recipe!",
        recipeId: "8f414b4f-ab39-4d36-bedb-2ad69da9c830",
        _createdOn: 1614260681375,
        _id: "0a272c58-b7ea-4e09-a000-7ec988248f66",
      },
    },
    records: {
      i01: {
        name: "John1",
        val: 1,
        _createdOn: 1613551388703,
      },
      i02: {
        name: "John2",
        val: 1,
        _createdOn: 1613551388713,
      },
      i03: {
        name: "John3",
        val: 2,
        _createdOn: 1613551388723,
      },
      i04: {
        name: "John4",
        val: 2,
        _createdOn: 1613551388733,
      },
      i05: {
        name: "John5",
        val: 2,
        _createdOn: 1613551388743,
      },
      i06: {
        name: "John6",
        val: 3,
        _createdOn: 1613551388753,
      },
      i07: {
        name: "John7",
        val: 3,
        _createdOn: 1613551388763,
      },
      i08: {
        name: "John8",
        val: 2,
        _createdOn: 1613551388773,
      },
      i09: {
        name: "John9",
        val: 3,
        _createdOn: 1613551388783,
      },
      i10: {
        name: "John10",
        val: 1,
        _createdOn: 1613551388793,
      },
    },
    catches: {
      "07f260f4-466c-4607-9a33-f7273b24f1b4": {
        _ownerId: "35c62d76-8152-4626-8712-eeb96381bea8",
        angler: "Paulo Admorim",
        weight: 636,
        species: "Atlantic Blue Marlin",
        location: "Vitoria, Brazil",
        bait: "trolled pink",
        captureTime: 80,
        _createdOn: 1614760714812,
        _id: "07f260f4-466c-4607-9a33-f7273b24f1b4",
      },
      "bdabf5e9-23be-40a1-9f14-9117b6702a9d": {
        _ownerId: "847ec027-f659-4086-8032-5173e2f9c93a",
        angler: "John Does",
        weight: 554,
        species: "Atlantic Blue Marlin",
        location: "Buenos Aires, Argentina",
        bait: "trolled pink",
        captureTime: 120,
        _createdOn: 1614760782277,
        _id: "bdabf5e9-23be-40a1-9f14-9117b6702a9d",
      },
    },
    furniture: {},
    orders: {},
    movies: {
      "1240549d-f0e0-497e-ab99-eb8f703713d7": {
        _ownerId: "847ec027-f659-4086-8032-5173e2f9c93a",
        title: "Black Widow",
        description:
          "Natasha Romanoff aka Black Widow confronts the darker parts of her ledger when a dangerous conspiracy with ties to her past arises. Comes on the screens 2020.",
        img: "https://miro.medium.com/max/735/1*akkAa2CcbKqHsvqVusF3-w.jpeg",
        _createdOn: 1614935055353,
        _id: "1240549d-f0e0-497e-ab99-eb8f703713d7",
      },
      "143e5265-333e-4150-80e4-16b61de31aa0": {
        _ownerId: "847ec027-f659-4086-8032-5173e2f9c93a",
        title: "Wonder Woman 1984",
        description:
          "Diana must contend with a work colleague and businessman, whose desire for extreme wealth sends the world down a path of destruction, after an ancient artifact that grants wishes goes missing.",
        img: "https://pbs.twimg.com/media/ETINgKwWAAAyA4r.jpg",
        _createdOn: 1614935181470,
        _id: "143e5265-333e-4150-80e4-16b61de31aa0",
      },
      "a9bae6d8-793e-46c4-a9db-deb9e3484909": {
        _ownerId: "35c62d76-8152-4626-8712-eeb96381bea8",
        title: "Top Gun 2",
        description:
          "After more than thirty years of service as one of the Navy's top aviators, Pete Mitchell is where he belongs, pushing the envelope as a courageous test pilot and dodging the advancement in rank that would ground him.",
        img: "https://i.pinimg.com/originals/f2/a4/58/f2a458048757bc6914d559c9e4dc962a.jpg",
        _createdOn: 1614935268135,
        _id: "a9bae6d8-793e-46c4-a9db-deb9e3484909",
      },
    },
    likes: {},
    ideas: {
      "833e0e57-71dc-42c0-b387-0ce0caf5225e": {
        _ownerId: "847ec027-f659-4086-8032-5173e2f9c93a",
        title: "Best Pilates Workout To Do At Home",
        description:
          "Lorem ipsum dolor, sit amet consectetur adipisicing elit. Minima possimus eveniet ullam aspernatur corporis tempore quia nesciunt nostrum mollitia consequatur. At ducimus amet aliquid magnam nulla sed totam blanditiis ullam atque facilis corrupti quidem nisi iusto saepe, consectetur culpa possimus quos? Repellendus, dicta pariatur! Delectus, placeat debitis error dignissimos nesciunt magni possimus quo nulla, fuga corporis maxime minus nihil doloremque aliquam quia recusandae harum. Molestias dolorum recusandae commodi velit cum sapiente placeat alias rerum illum repudiandae? Suscipit tempore dolore autem, neque debitis quisquam molestias officia hic nesciunt? Obcaecati optio fugit blanditiis, explicabo odio at dicta asperiores distinctio expedita dolor est aperiam earum! Molestias sequi aliquid molestiae, voluptatum doloremque saepe dignissimos quidem quas harum quo. Eum nemo voluptatem hic corrupti officiis eaque et temporibus error totam numquam sequi nostrum assumenda eius voluptatibus quia sed vel, rerum, excepturi maxime? Pariatur, provident hic? Soluta corrupti aspernatur exercitationem vitae accusantium ut ullam dolor quod!",
        img: "./images/best-pilates-youtube-workouts-2__medium_4x3.jpg",
        _createdOn: 1615033373504,
        _id: "833e0e57-71dc-42c0-b387-0ce0caf5225e",
      },
      "247efaa7-8a3e-48a7-813f-b5bfdad0f46c": {
        _ownerId: "847ec027-f659-4086-8032-5173e2f9c93a",
        title: "4 Eady DIY Idea To Try!",
        description:
          "Similique rem culpa nemo hic recusandae perspiciatis quidem, quia expedita, sapiente est itaque optio enim placeat voluptates sit, fugit dignissimos tenetur temporibus exercitationem in quis magni sunt vel. Corporis officiis ut sapiente exercitationem consectetur debitis suscipit laborum quo enim iusto, labore, quod quam libero aliquid accusantium! Voluptatum quos porro fugit soluta tempore praesentium ratione dolorum impedit sunt dolores quod labore laudantium beatae architecto perspiciatis natus cupiditate, iure quia aliquid, iusto modi esse!",
        img: "./images/brightideacropped.jpg",
        _createdOn: 1615033452480,
        _id: "247efaa7-8a3e-48a7-813f-b5bfdad0f46c",
      },
      "b8608c22-dd57-4b24-948e-b358f536b958": {
        _ownerId: "35c62d76-8152-4626-8712-eeb96381bea8",
        title: "Dinner Recipe",
        description:
          "Consectetur labore et corporis nihil, officiis tempora, hic ex commodi sit aspernatur ad minima? Voluptas nesciunt, blanditiis ex nulla incidunt facere tempora laborum ut aliquid beatae obcaecati quidem reprehenderit consequatur quis iure natus quia totam vel. Amet explicabo quidem repellat unde tempore et totam minima mollitia, adipisci vel autem, enim voluptatem quasi exercitationem dolor cum repudiandae dolores nostrum sit ullam atque dicta, tempora iusto eaque! Rerum debitis voluptate impedit corrupti quibusdam consequatur minima, earum asperiores soluta. A provident reiciendis voluptates et numquam totam eveniet! Dolorum corporis libero dicta laborum illum accusamus ullam?",
        img: "./images/dinner.jpg",
        _createdOn: 1615033491967,
        _id: "b8608c22-dd57-4b24-948e-b358f536b958",
      },
    },
    catalog: {
      "53d4dbf5-7f41-47ba-b485-43eccb91cb95": {
        _ownerId: "35c62d76-8152-4626-8712-eeb96381bea8",
        make: "Table",
        model: "Swedish",
        year: 2015,
        description: "Medium table",
        price: 235,
        img: "./images/table.png",
        material: "Hardwood",
        _createdOn: 1615545143015,
        _id: "53d4dbf5-7f41-47ba-b485-43eccb91cb95",
      },
      "f5929b5c-bca4-4026-8e6e-c09e73908f77": {
        _ownerId: "847ec027-f659-4086-8032-5173e2f9c93a",
        make: "Sofa",
        model: "ES-549-M",
        year: 2018,
        description: "Three-person sofa, blue",
        price: 1200,
        img: "./images/sofa.jpg",
        material: "Frame - steel, plastic; Upholstery - fabric",
        _createdOn: 1615545572296,
        _id: "f5929b5c-bca4-4026-8e6e-c09e73908f77",
      },
      "c7f51805-242b-45ed-ae3e-80b68605141b": {
        _ownerId: "847ec027-f659-4086-8032-5173e2f9c93a",
        make: "Chair",
        model: "Bright Dining Collection",
        year: 2017,
        description: "Dining chair",
        price: 180,
        img: "./images/chair.jpg",
        material: "Wood laminate; leather",
        _createdOn: 1615546332126,
        _id: "c7f51805-242b-45ed-ae3e-80b68605141b",
      },
    },
    teams: {
      "34a1cab1-81f1-47e5-aec3-ab6c9810efe1": {
        _ownerId: "35c62d76-8152-4626-8712-eeb96381bea8",
        name: "Storm Troopers",
        logoUrl: "/assets/atat.png",
        description: "These ARE the droids we're looking for",
        _createdOn: 1615737591748,
        _id: "34a1cab1-81f1-47e5-aec3-ab6c9810efe1",
      },
      "dc888b1a-400f-47f3-9619-07607966feb8": {
        _ownerId: "847ec027-f659-4086-8032-5173e2f9c93a",
        name: "Team Rocket",
        logoUrl: "/assets/rocket.png",
        description: "Gotta catch 'em all!",
        _createdOn: 1615737655083,
        _id: "dc888b1a-400f-47f3-9619-07607966feb8",
      },
      "733fa9a1-26b6-490d-b299-21f120b2f53a": {
        _ownerId: "847ec027-f659-4086-8032-5173e2f9c93a",
        name: "Minions",
        logoUrl: "/assets/hydrant.png",
        description:
          "Friendly neighbourhood jelly beans, helping evil-doers succeed.",
        _createdOn: 1615737688036,
        _id: "733fa9a1-26b6-490d-b299-21f120b2f53a",
      },
    },
    members: {
      "cc9b0a0f-655d-45d7-9857-0a61c6bb2c4d": {
        _ownerId: "35c62d76-8152-4626-8712-eeb96381bea8",
        teamId: "34a1cab1-81f1-47e5-aec3-ab6c9810efe1",
        status: "member",
        _createdOn: 1616236790262,
        _updatedOn: 1616236792930,
      },
      "61a19986-3b86-4347-8ca4-8c074ed87591": {
        _ownerId: "847ec027-f659-4086-8032-5173e2f9c93a",
        teamId: "dc888b1a-400f-47f3-9619-07607966feb8",
        status: "member",
        _createdOn: 1616237188183,
        _updatedOn: 1616237189016,
      },
      "8a03aa56-7a82-4a6b-9821-91349fbc552f": {
        _ownerId: "847ec027-f659-4086-8032-5173e2f9c93a",
        teamId: "733fa9a1-26b6-490d-b299-21f120b2f53a",
        status: "member",
        _createdOn: 1616237193355,
        _updatedOn: 1616237195145,
      },
      "9be3ac7d-2c6e-4d74-b187-04105ab7e3d6": {
        _ownerId: "35c62d76-8152-4626-8712-eeb96381bea8",
        teamId: "dc888b1a-400f-47f3-9619-07607966feb8",
        status: "member",
        _createdOn: 1616237231299,
        _updatedOn: 1616237235713,
      },
      "280b4a1a-d0f3-4639-aa54-6d9158365152": {
        _ownerId: "60f0cf0b-34b0-4abd-9769-8c42f830dffc",
        teamId: "dc888b1a-400f-47f3-9619-07607966feb8",
        status: "member",
        _createdOn: 1616237257265,
        _updatedOn: 1616237278248,
      },
      "e797fa57-bf0a-4749-8028-72dba715e5f8": {
        _ownerId: "60f0cf0b-34b0-4abd-9769-8c42f830dffc",
        teamId: "34a1cab1-81f1-47e5-aec3-ab6c9810efe1",
        status: "member",
        _createdOn: 1616237272948,
        _updatedOn: 1616237293676,
      },
    },
  };
  var rules$1 = {
    users: {
      ".create": false,
      ".read": ["Owner"],
      ".update": false,
      ".delete": false,
    },
    members: {
      ".update": "isOwner(user, get('teams', data.teamId))",
      ".delete":
        "isOwner(user, get('teams', data.teamId)) || isOwner(user, data)",
      "*": {
        teamId: {
          ".update": "newData.teamId = data.teamId",
        },
        status: {
          ".create": "newData.status = 'pending'",
        },
      },
    },
  };
  var settings = {
    identity: identity,
    protectedData: protectedData,
    seedData: seedData,
    rules: rules$1,
  };

  const plugins = [
    storage(settings),
    auth(settings),
    util$2(),
    rules(settings),
  ];

  const server = http__default["default"].createServer(
    requestHandler(plugins, services)
  );

  const port = 3030;
  server.listen(port);
  console.log(
    `Server started on port ${port}. You can make requests to http://localhost:${port}/`
  );
  console.log(`Admin panel located at http://localhost:${port}/admin`);

  var softuniPracticeServer = {};

  return softuniPracticeServer;
});
