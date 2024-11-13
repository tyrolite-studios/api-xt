import { createContext, useState, useRef, useContext, useEffect } from "react"
import { treeBuilder } from "core/tree"
import {
    startAbortableApiRequestStream,
    startAbortableApiBodyRequest
} from "core/http"
import { useComponentUpdate, useLoadingSpinner } from "./common"
import { d, getPathInfo, apply, md5 } from "core/helper"
import { HOOKS, PluginRegistry } from "core/plugin"
import {
    defaultApiSettings,
    defaultGlobalSettings,
    defaultKeyBindings
} from "./settings"
import { EntityIndex, MappingIndex, HeadersIndex } from "core/entity"

const controller = window.controller
const AppContext = createContext(null)

function FixCursorArea() {
    const aContext = useContext(AppContext)
    const [fixCursor, setFixCursor] = useState(null)

    useEffect(() => {
        aContext.register("setFixCursor", setFixCursor)
    }, [])

    const style = {
        cursor: fixCursor ? fixCursor : "auto",
        zIndex: 999999
    }
    if (fixCursor === null) {
        style.display = "none"
    }
    return (
        <div
            key="fc"
            style={style}
            className="fixed top-0 left-0 bg-transparent full"
        />
    )
}

function SpinnerDiv() {
    const aContext = useContext(AppContext)
    const LoadingSpinner = useLoadingSpinner()
    useEffect(() => {
        aContext.register("spinner", LoadingSpinner)
    }, [])

    return <>{LoadingSpinner.Modal}</>
}

class RouteIndex extends EntityIndex {
    constructor(routes) {
        super()
        this.model = routes
        this.items = routes.map((route) => route.path)
    }

    getEntityProps() {
        return [...super.getEntityProps(), "path", "methods"]
    }

    getEntityValue(index) {
        return this.items[index].path
    }

    getEntityPropValue(index, prop) {
        if (prop === "path") {
            return this.model[index].path
        }
        if (prop === "methods") return this.model[index].methods
        return super.getEntityPropValue(index, prop)
    }
}

function registerRouteApi({ config }) {
    const routeIndex = new RouteIndex(config.routes)

    const getMatchingRoutePath = (resolvedPath, method) => {
        for (const { path, methods } of routeIndex.getEntityObjects()) {
            if (!methods.includes(method)) continue

            const pathInfo = getPathInfo(path)
            const pathRegexp = new RegExp(pathInfo.regexp)
            if (pathRegexp.test(resolvedPath)) return pathInfo
        }
        return null
    }

    return {
        routeIndex,
        getMatchingRoutePath
    }
}

/*
 * The modal API allows to manage modals and windows
 */
function registerModalApi({ registry, register }) {
    register("buttonRefocus", null)
    register("focusStack", {
        elem: {},
        zIndex: null
    })
    register("modalStack", [])
    register("modalIds", [])
    register("lastTarget", null)

    const getModalLevel = () => registry("modalStack").length
    register("getModalLevel", getModalLevel)

    return {
        focusStack: registry("focusStack"),
        setButtonRefocus: (value) => {
            register("buttonRefocus", value)
        },
        pushModalId: (id) => registry("modalIds").push(id),
        popModalId: () => registry("modalIds").pop(),
        getModalLevel,
        openModal: () => {
            const { modalStack, focusStack, lastTarget, buttonRefocus } =
                registry()

            let zIndex = 10000
            const len = modalStack.length
            if (len > 0) {
                zIndex = modalStack[len - 1] + 10
            }
            modalStack.push(zIndex)
            focusStack.zIndex = zIndex
            focusStack.elem[zIndex] = {
                top: null,
                auto: null,
                start: null,
                setShadow: null,
                submit: null,
                lastFocus: buttonRefocus
                    ? buttonRefocus
                    : document.activeElement,
                lastTarget
            }
            return zIndex
        },
        getModalSubmit: () => {
            const { modalStack, focusStack } = registry()
            const zIndex = modalStack[modalStack.length - 1]
            return focusStack.elem[zIndex].submit
        },
        setModalSubmit: (submit) => {
            const { modalStack, focusStack } = registry()
            const zIndex = modalStack[modalStack.length - 1]
            focusStack.elem[zIndex].submit = submit
        },
        closeModal: (zIndex) => {
            const { modalStack, focusStack } = registry()

            const index = modalStack.indexOf(zIndex)
            if (index === -1) {
                return
            }
            modalStack.splice(index, 1)
            const { lastTarget, lastFocus } = focusStack.elem[zIndex]
            register("lastTarget", lastTarget)
            if (lastFocus) {
                requestAnimationFrame(() => {
                    if (typeof lastFocus === "function") {
                        lastFocus()
                    } else {
                        lastFocus.focus()
                    }
                })
            }
            delete focusStack.elem[zIndex]
            focusStack.zIndex = modalStack.length
                ? modalStack[modalStack.length - 1]
                : null
            if (focusStack.zIndex) {
                const old = focusStack.elem[focusStack.zIndex]
                if (old && old.setShadow) {
                    old.setShadow()
                }
            }
        },
        getLastTarget: () => registry("lastTarget")
    }
}

/*
 * The hotkey API manages action triggered by key bindings
 */
function registerHotkeyApi({ registry, register }) {
    const action2hotKey = defaultKeyBindings
    const hotKey2action = {}
    for (let [action, key] of Object.entries(action2hotKey)) {
        if (key !== null) {
            hotKey2action[key] = action
        }
    }
    register("hotKeyActions", {
        action2hotKey,
        hotKey2action
    })
    register("elemKeyBindings", [])

    const getHotKeyArea = (area) => {
        const { elemKeyBindings, getModalLevel } = registry()

        const currLevel = getModalLevel()
        for (let item of elemKeyBindings) {
            if (currLevel === item[3] && item[2] == area) {
                return item[0]
            }
        }
        return null
    }

    const getHandlerForAction = (
        action,
        elem,
        followLinks = true,
        passed = false
    ) => {
        const { elemKeyBindings, getModalLevel } = registry()

        const currLevel = getModalLevel()
        for (let [node, bindings, area, level, links] of elemKeyBindings) {
            if (elem === node && level === currLevel) {
                passed = true
                const binding = bindings[action]
                if (binding) {
                    return binding
                }
                if (followLinks) {
                    for (let link of links) {
                        const node = getHotKeyArea(link)
                        if (node) {
                            const binding = getHandlerForAction(
                                action,
                                node,
                                false,
                                passed
                            )
                            if (binding) {
                                return binding
                            }
                        }
                    }
                }
            }
        }
        if (!followLinks || !elem || elem.id === "modals-container") {
            return passed ? undefined : false
        }
        elem = elem.parentNode
        if (elem) {
            return getHandlerForAction(action, elem, true, passed)
        }
        return passed ? undefined : false
    }

    return {
        addElemKeyBinding: (
            elem,
            action2handlers = {},
            area = null,
            link = null
        ) => {
            const { getModalLevel } = registry()
            if (elem === null) {
                return
            }
            if (!link) {
                link = []
            } else if (!Array.isArray(link)) {
                link = [link]
            }
            registry("elemKeyBindings").push([
                elem,
                action2handlers,
                area,
                getModalLevel(),
                link
            ])
        },
        deleteElemKeyBindings: (elem) => {
            const { elemKeyBindings } = registry()

            let index = 0
            for (let item of elemKeyBindings) {
                if (item[0] === elem) {
                    elemKeyBindings.splice(index, 1)
                    break
                }
                index++
            }
        },
        getHotKeyArea,
        focusHotKeyArea: (area) => {
            let elem = getHotKeyArea(area)
            if (elem) {
                const areaElem = elem
                elem = elem.querySelector(".tabbed")
                if (elem) {
                    const { markFocusArea } = registry()
                    const rectElem =
                        areaElem.parentNode &&
                        areaElem.parentNode.classList.contains("parent")
                            ? areaElem.parentNode
                            : areaElem
                    markFocusArea(rectElem.getBoundingClientRect())
                    elem.focus()
                    register("lastTarget", elem)
                    return true
                }
            }
            return false
        },

        getHandlerForActionKey: (actionKey, elem) => {
            const { elemKeyBindings, hotKeyActions } = registry()
            if (elemKeyBindings.length === 0) {
                return null
            }
            const action = hotKeyActions.hotKey2action[actionKey]
            if (!action) {
                return null
            }
            let handler = getHandlerForAction(action, elem)

            if (handler === false) {
                // try hotkey region 1 when no area was found along the node path
                const node = getHotKeyArea(1)
                if (node) {
                    handler = getHandlerForAction(action, node)
                }
            }

            return handler ? handler : null
        },

        hotKeyActions: registry("hotKeyActions")
    }
}

/*
 *
 */
function registerSettingsApi({ registry, register, apiRef }) {
    register("globalStorage", controller.globalStorage)
    register("apiStorage", controller.apiStorage)
    register("tempStorage", controller.tempStorage)
    register("apiSettings", {})
    register("globalSettings", {})
    register("plugins", {})
    register("keyBindings", {})

    const rebuildSettings = (restart = true) => {
        const {
            apiStorage,
            globalStorage,
            apiSettings,
            globalSettings,
            keyBindings,
            plugins
        } = registry()
        const apiStored = apiStorage.getJson("settings", {})
        const newApiSettings = { ...defaultApiSettings, ...apiStored }
        apply(newApiSettings, apiSettings)

        const globalStored = globalStorage.getJson("settings", {})
        const newGlobalSettings = { ...defaultGlobalSettings, ...globalStored }
        apply(newGlobalSettings, globalSettings)

        const pluginsStored = apiStorage.getJson("plugins", {})
        const newPlugins = {
            ...PluginRegistry.getDefaultStates(),
            ...pluginsStored
        }
        apply(newPlugins, plugins)
        PluginRegistry.setStates(newPlugins)

        const keyBindingsStored = apiStorage.getJson("keyBindings", {})
        const newKeyBindings = {
            ...defaultKeyBindings,
            ...keyBindingsStored
        }
        apply(newKeyBindings, keyBindings)
        if (!restart) return

        apiRef.current.update()
    }

    rebuildSettings(false)

    return {
        apiSettings: registry("apiSettings"),
        globalSettings: registry("globalSettings"),
        plugins: registry("plugins"),
        keyBindings: registry("keyBindings"),
        rebuildSettings,
        globalStorage: registry("globalStorage"),
        apiStorage: registry("apiStorage"),
        tempStorage: registry("tempStorage")
    }
}

/*
 * The content API controlls the content area of the API extender where the content from the API is loaded
 */
function registerContentApi({ registry, register }) {
    register("treeBuilder", treeBuilder)
    register("lastStatus", null)
    register("streamAbort", null)

    const baseHeaderIndex = new HeadersIndex(
        registry("apiStorage").getJson("baseHeaders", {})
    )
    register("baseHeaderIndex", baseHeaderIndex)
    const startContentStream = (request) => {
        PluginRegistry.applyHooks(HOOKS.FETCH_CONTENT, request)

        const { treeBuilder, spinner, config, baseHeaderIndex, history } =
            registry()

        history.push2history(request)

        treeBuilder.reset()

        register("lastRequest", request)
        const { headers = {}, ...options } = request
        for (const {
            value,
            headerValue,
            type
        } of baseHeaderIndex.getEntityObjects()) {
            if (value in headers) continue

            if (type === "fix") {
                headers[value] = headerValue
            }
        }
        headers[config.dumpHeader] = "cmd"

        const httpStream = startAbortableApiRequestStream(config.baseUrl, {
            headers,
            ...options
        })
        register("streamAbort", httpStream.abort)
        const promise = treeBuilder.processStream(httpStream).finally(() => {
            register("lastStatus", httpStream.status)
            register("streamAbort", null)
        })

        spinner.start(promise, () => {
            httpStream.abort()
            treeBuilder.abort()
        })
    }

    const restartContentStream = (overwrites = {}) => {
        const { lastRequest } = registry()
        if (!lastRequest) return

        const { headers, ...options } = lastRequest
        let addHeaders = {}
        if (headers && overwrites.headers) {
            addHeaders = {
                headers: { ...headers, ...overwrites.headers }
            }
        }
        startContentStream({ ...options, ...overwrites, ...addHeaders })
    }

    return {
        treeBuilder: registry("treeBuilder"),
        startContentStream,
        restartContentStream,
        abortContentStream: () => {
            const { streamAbort } = registry()
            if (streamAbort) streamAbort()
        },
        haltContentStream: (hash) => {
            restartContentStream({ headers: { "Tls-Apixt-Halt": hash } })
        },
        getRawContentPromise: (baseUrl) => {
            const { lastRequest } = registry()

            const { headers = {}, ...options } = lastRequest
            for (const {
                value,
                headerValue,
                type
            } of baseHeaderIndex.getEntityObjects()) {
                if (value in headers) continue

                if (type === "fix") {
                    headers[value] = headerValue
                }
            }

            return startAbortableApiBodyRequest(baseUrl, {
                headers,
                ...options,
                expect: () => true
            })
        },
        clearContent: () => {
            const { treeBuilder } = registry()
            treeBuilder.reset()
        },
        getLastStatus: () => registry("lastStatus"),
        getBaseHeaderIndex: () => registry("baseHeaderIndex")
    }
}

/*
 * The event API allows to register global listeners and also manages an exclusive mode which makes sure that
 * there are no side-effects while the mode is active
 */
function registerEventManagementApi({ registry, register }) {
    register("listeners", [])
    register("mode", null)

    const removeEventListener = (type) => {
        const { listeners } = registry()

        const handlers = listeners[type]
        if (!handlers || handlers.length === 0) {
            return
        }
        const last = handlers.pop()
        window.removeEventListener(type, last.handler, last.options)
        if (last.options.cleanUp) {
            last.options.cleanUp()
        }
    }

    const isInExclusiveMode = () => registry("mode") !== null

    const endExclusiveMode = (id) => {
        const { mode, listeners, setFixCursor } = registry()
        if (!id || mode !== id) {
            return
        }
        if (listeners) {
            for (let type of Object.keys(listeners)) {
                removeEventListener(type)
            }
        }
        register("mode", null)
        if (id.startsWith("mouse:")) {
            setFixCursor(null)
        }
    }

    return {
        startExclusiveMode: (id, cursor = "auto") => {
            const { mode, setFixCursor } = registry()
            if (mode !== null) {
                endExclusiveMode(mode)
            }
            register("mode", id)
            if (id.startsWith("mouse:")) {
                setFixCursor(cursor)
            }
        },
        isInExclusiveMode,
        endExclusiveMode,
        onExclusiveModeEnd: (callback) => {
            const check = () => {
                if (!isInExclusiveMode()) {
                    callback()
                } else {
                    requestAnimationFrame(check)
                }
            }
            check()
        },
        addEventListener: (type, listener, options = false) => {
            const { mode, listeners } = registry()

            if (!mode)
                throw Error(
                    `No call of start exclusive mode before addEventListener`
                )

            const handler = (event, ...params) => {
                let result = false
                try {
                    result = listener(event, ...params)
                } catch (e) {
                    console.error(
                        `An error occured in the event handler "${type}": ${e}`
                    )
                    endExclusiveMode(mode) // problems? get from registry
                }
                if (options.once) {
                    removeEventListener(type)
                }
                if (!options.propagate) {
                    event.stopPropagation()
                }
                return result
            }
            window.addEventListener(type, handler, options)
            if (!listeners[type]) {
                listeners[type] = []
            }
            listeners[type].push({ handler, options })
        },
        removeEventListener
    }
}

function registerHistoryApi({ registry, register }) {
    const { apiStorage } = registry()

    const history = apiStorage.getJson("requestHistory", [])

    const restrictHistory = () => {
        while (history.length > 10) {
            history.pop()
        }
    }

    const push2history = (request) => {
        const hash = md5(request)
        let i = 0
        while (i < history.length && history[i].hash !== hash) i++

        if (i < history.length) {
            history.splice(i, 1)
        }
        history.unshift({
            timestamp: Date.now(),
            request,
            hash
        })
        restrictHistory()
        apiStorage.setJson("requestHistory", history)
    }

    register("history", { push2history })

    const getLastPathParams = (path) => {
        const pathInfo = getPathInfo(path)
        if (!pathInfo.varCount) return []

        const matchExpr = new RegExp(pathInfo.regexp)

        for (const { request } of history) {
            const matches = matchExpr.exec(request.path)
            if (matches === null) continue

            const result = []
            let i = 0
            while (i < pathInfo.varCount) {
                i++
                result.push(matches[i])
            }
            return result
        }
        return []
    }

    return {
        history,
        push2history,
        getLastPathParams
    }
}

function AppCtx({ config, children }) {
    const registryRef = useRef()
    const apiRef = useRef()
    const registry = (key = null) =>
        key ? registryRef.current[key] : registryRef.current

    const update = useComponentUpdate()

    if (!registry()) {
        const register = (key, value) => {
            registryRef.current[key] = value
        }

        registryRef.current = {
            updates: 0,
            config,
            version: "0.1.0",
            mode: null,
            confirm: null,
            lastRequest: null,
            dirty: false,
            spinner: null
        }

        const registration = { register, registry, apiRef, config }

        apiRef.current = {
            ...registerSettingsApi(registration),
            ...registerEventManagementApi(registration),
            ...registerRouteApi(registration),
            ...registerContentApi(registration),
            ...registerHistoryApi(registration),
            ...registerModalApi(registration),
            ...registerHotkeyApi(registration),

            config: registry("config"),
            version: registry("version"),
            register,
            update: () => {
                apiRef.current = { ...apiRef.current }
                update()
            }
        }
    }
    return (
        <AppContext.Provider value={apiRef.current}>
            <>
                <SpinnerDiv key="sd" />
                <FixCursorArea key="em" />
                {children}
            </>
        </AppContext.Provider>
    )
}

export { AppContext, AppCtx }
