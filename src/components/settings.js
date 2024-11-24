import { Fragment, useContext, useState, useRef, useMemo } from "react"
import { PluginRegistry } from "core/plugin"
import {
    Checkbox,
    FormGrid,
    NumberCells,
    InputCells,
    RadioCells,
    CheckboxCells,
    FullCell,
    CustomCells,
    SectionCells,
    Slider,
    Number,
    ColorCells,
    SliderCells
} from "./form"
import { useConfirmation, EntityStack } from "./common"
import { AppContext } from "./context"
import { Div, Tabs, Tab, Stack, OkCancelLayout, Centered, Icon } from "./layout"
import { d, isString, cloneDeep } from "core/helper"
import { useModalWindow } from "./modal"
import themeManager from "core/theme"
import {
    MappingIndex,
    SimpleMappingIndex,
    extractLcProps
} from "../core/entity"
import { ClassNames } from "../core/helper"
import { ConstantStack } from "entities/constants"
import { ApiEnvIndex } from "entities/api-envs"

const root = document.documentElement

const defaultGlobalSettings = {
    autoScroll: true,
    animations: true,
    tabWidth: 4,
    history: 100,
    trapFocus: true
}

const defaultKeyBindings = {
    undo: "m z",
    redo: "m y",
    save: "m s",
    export: "m x",
    new: "c n",
    select: "",
    delete: "c d",
    toggle: "c t",
    quit: "c q",
    edit: "m e",
    all: "c a",
    pick: "c p",
    play: "m p",
    submit: "Enter",
    close: "Escape"
}

const defaultApiSettings = {
    apiEnvs: {}
}

class PluginIndex extends SimpleMappingIndex {
    constructor(model) {
        super(model, "active")
    }

    getEntityProps() {
        return [...super.getEntityProps(), "name", "description"]
    }

    getEntityPropValue(index, prop) {
        if (["name", "description"].includes(prop)) {
            const id = this.getEntityValue(index)
            return PluginRegistry.getPlugin(id)[prop]
        }
        return super.getEntityPropValue(index, prop)
    }
}

function PluginStack({ pluginIndex }) {
    return (
        <EntityStack
            emptyMsg={"No plugins available"}
            entityIndex={pluginIndex}
            render={({ index, name, value, description, active }) => (
                <Stack key={value} gapped className="">
                    <div className="text-sm">
                        <Checkbox
                            tab={false}
                            value={active}
                            set={(value) => {
                                pluginIndex.setEntityPropValue(
                                    index,
                                    "active",
                                    value
                                )
                            }}
                        />
                    </div>
                    <div className="stack-v">
                        <div className="text-sm">{name}</div>
                        <div className="opacity-50 text-xs">{description}</div>
                    </div>
                </Stack>
            )}
        />
    )
}

function PluginsOverview({ pluginIndex }) {
    return (
        <FormGrid>
            <SectionCells name="Available Plugins" />
            <FullCell>
                <PluginStack pluginIndex={pluginIndex} />
            </FullCell>
        </FormGrid>
    )
}

function About() {
    const aContext = useContext(AppContext)
    const { language, apixt, platform } = aContext.config.hostingApi

    return (
        <Centered>
            <div className="stack-v gap-2 p-2">
                <div className="text-2xl">API Extender</div>
                <div className="text-sm">
                    Version 0.0.1 (Frontend)
                    <br />
                    <span className="opacity-50 text-xs">
                        <a href="">www.github.com/tyrolite-studios/apixt</a>
                    </span>
                    <br />
                    <br />
                    API Language: {language.name + " " + language.version}
                    <br />
                    Operating System: {platform.name + " " + platform.version}
                    <br />
                    API Extender Backend: {apixt.name + " " + apixt.version}
                    <br />
                    <span className="opacity-50 text-xs">
                        <a href="">{apixt.link}</a>
                    </span>
                    <br />
                    <br />
                    <span className="text-xs opacity-50">
                        © 2024 TyroLite Studios
                    </span>
                </div>
                <div className="text-sm"></div>
            </div>
        </Centered>
    )
}

function NewApiEnv({ close, model, save, reserved = [] }) {
    const [name, setName] = useState(model.name)
    const [url, setUrl] = useState(model.url)
    const [cors, setCors] = useState(model.cors ?? true)
    return (
        <OkCancelLayout
            cancel={close}
            ok={() => save({ name, url, cors })}
            submit
        >
            <FormGrid className="p-4">
                <InputCells
                    name="Name:"
                    value={name}
                    set={setName}
                    isValid={(value) => !reserved.includes(value.toLowerCase())}
                    autoFocus
                    required
                />
                <InputCells name="URL:" value={url} set={setUrl} required />
                <CheckboxCells name="CORS:" value={cors} set={setCors} />
            </FormGrid>
        </OkCancelLayout>
    )
}

function ApiEnvStack({ entityIndex }) {
    const NewEnvModal = useModalWindow()

    const actions = [
        {
            action: "add",
            name: "New",
            op: {
                exec: () => {
                    const model = {
                        value: crypto.randomUUID(),
                        name: "",
                        cors: true,
                        url: ""
                    }
                    const reserved = extractLcProps(entityIndex, "name")
                    NewEnvModal.open({
                        model,
                        reserved,
                        save: (newModel) => {
                            entityIndex.setEntityObject({
                                ...model,
                                ...newModel
                            })
                            NewEnvModal.close()
                        }
                    })
                }
            }
        },
        {
            action: "edit",
            op: {
                exec: (selected) => {
                    const index = selected[0]
                    const model = entityIndex.getEntityObject(index)
                    const reserved = extractLcProps(entityIndex, "name", model)
                    NewEnvModal.open({
                        edit: true,
                        model,
                        reserved,
                        save: (newModel) => {
                            entityIndex.setEntityObject(
                                {
                                    ...model,
                                    ...newModel
                                },
                                true
                            )
                            NewEnvModal.close()
                        }
                    })
                },
                can: (selected) => selected.length === 1
            }
        },
        {
            action: "delete",
            op: {
                exec: (selected, setSelected) => {
                    entityIndex.deleteEntities(selected)
                    setSelected([])
                },
                can: (selected) => selected.length > 0
            }
        }
    ]
    const itemActions = [
        {
            icon: "edit",
            action: (index) => {
                const model = entityIndex.getEntityObject(index)
                const reserved = extractLcProps(entityIndex, "name", model)
                NewEnvModal.open({
                    edit: true,
                    model,
                    reserved,
                    save: (newModel) => {
                        entityIndex.setEntityObject(
                            {
                                ...model,
                                ...newModel
                            },
                            true
                        )
                        NewEnvModal.close()
                    }
                })
            }
        }
    ]

    return (
        <>
            <EntityStack
                emptyMsg={
                    "No API environments available. Add one by clicking on the new button above"
                }
                entityIndex={entityIndex}
                render={({ name, url }) => (
                    <Stack vertical key={name} className="">
                        <div className="text-sm">{name}</div>
                        <div className="text-app-text text-xs">
                            URL: <span className="text-app-text/50">{url}</span>
                        </div>
                    </Stack>
                )}
                actions={actions}
                itemActions={itemActions}
            />

            <NewEnvModal.content name="New API environment">
                <NewApiEnv {...NewEnvModal.props} />
            </NewEnvModal.content>
        </>
    )
}

function General({ general, setGeneral, apiEnvIndex }) {
    const aContext = useContext(AppContext)
    const getGeneralSetter = (prop) => {
        return (value) => {
            const newGeneral = { ...general }
            newGeneral[prop] = value
            setGeneral(newGeneral)
        }
    }
    return (
        <FormGrid className="px-4">
            <SectionCells name="Behaviour" />
            <NumberCells
                name="Tab width:"
                value={general.tabWidth}
                set={getGeneralSetter("tabWidth")}
                min={0}
                max={9}
            />
            <NumberCells
                name="Max history entries:"
                value={general.history}
                set={getGeneralSetter("history")}
                min={0}
                max={9999}
            />
            <CheckboxCells
                name="Animations:"
                value={general.animations}
                set={getGeneralSetter("animations")}
            />
            <CheckboxCells
                name="Auto scroll content:"
                value={general.autoScroll}
                set={getGeneralSetter("autoScroll")}
            />
            <CheckboxCells
                name="Trap focus:"
                value={general.trapFocus}
                set={getGeneralSetter("trapFocus")}
            />
            <SectionCells name="API environments" />
            <FullCell className="px-2">
                <ApiEnvStack entityIndex={apiEnvIndex} />
            </FullCell>

            <SectionCells name="Constants" />
            <FullCell className="px-2">
                <ConstantStack
                    constantIndex={aContext.constantIndex}
                    apiEnvIndex={apiEnvIndex}
                />
            </FullCell>
        </FormGrid>
    )
}

function Theme({ theme, setTheme }) {
    const getThemeSetter = (prop) => {
        return (value) => {
            const newTheme = { ...theme }
            newTheme[prop] = value
            setTheme(newTheme)
        }
    }
    return (
        <FormGrid className="px-4">
            <SectionCells name="Buttons" />
            <SliderCells
                name="Padding x:"
                min={0}
                max={20}
                value={theme.buttonPaddingX_px}
                set={getThemeSetter("buttonPaddingX_px")}
            />
            <SliderCells
                name="Padding y:"
                min={0}
                max={10}
                value={theme.buttonPaddingY_px}
                set={getThemeSetter("buttonPaddingY_px")}
            />
            <ColorCells name="Background:" value={theme.buttonBg_rgb} />
            <ColorCells name="Text:" value={theme.buttonText_rgb} />
            <ColorCells name="Border:" value={theme.buttonBorder_rgb} />

            <SectionCells name="Inputs" />
            <SliderCells
                name="Padding x:"
                min={0}
                max={20}
                value={theme.inputPaddingX_px}
                set={getThemeSetter("inputPaddingX_px")}
            />
            <SliderCells
                name="Padding y:"
                min={0}
                max={10}
                value={theme.inputPaddingY_px}
                set={getThemeSetter("inputPaddingY_px")}
            />
            <ColorCells name="Background:" value={theme.inputBg_rgb} />
            <ColorCells name="Text:" value={theme.inputText_rgb} />
            <ColorCells name="Border:" value={theme.inputBorder_rgb} />
        </FormGrid>
    )
}

function DimInputsCells({
    name,
    min,
    max,
    value,
    setValue,
    unlimited,
    setUnlimited
}) {
    return (
        <CustomCells name={name}>
            <Stack vertical gapped>
                <Stack gapped>
                    <Checkbox value={unlimited} set={setUnlimited} />
                    <div className="text-xs">Unlimited</div>
                </Stack>
                <Stack gapped width="400px">
                    <Number
                        min={min}
                        max={max}
                        value={value}
                        set={setValue}
                        disabled={unlimited}
                    />
                    <Slider
                        full
                        className="auto"
                        min={min}
                        max={max}
                        value={value}
                        set={setValue}
                        tab={false}
                        disabled={unlimited}
                    />
                </Stack>
            </Stack>
        </CustomCells>
    )
}

function Layout({ layout, setLayout }) {
    const getLayoutSetter = (prop) => {
        return (value) => {
            const newLayout = { ...layout }
            newLayout[prop] = value
            setLayout(newLayout)
        }
    }
    return (
        <FormGrid className="px-4">
            <SectionCells name="Layout" />
            <RadioCells
                name="Navigation:"
                value={layout.sidebar}
                set={getLayoutSetter("sidebar")}
                options={[
                    { id: false, name: "Header" },
                    { id: true, name: "Sidebar" }
                ]}
            />
            <DimInputsCells
                name="Max width:"
                min={600}
                max={2000}
                value={layout.width}
                setValue={getLayoutSetter("width")}
                unlimited={layout.wMax}
                setUnlimited={getLayoutSetter("wMax")}
            />
            <DimInputsCells
                name="Max height:"
                min={400}
                max={2000}
                value={layout.height}
                setValue={getLayoutSetter("height")}
                unlimited={layout.hMax}
                setUnlimited={getLayoutSetter("hMax")}
            />
        </FormGrid>
    )
}

const HotKeySingleKeys = ["Escape", "Enter"]
const HotKeySkipValues = ["Meta", "Control", "Alt", "Shift"]

function KeyBindingEdit({ action, save, close, mapping = {}, ...props }) {
    const [hotKey, setHotKey] = useState(null)
    const recorderRef = useRef(null)

    const onKeyDown = (e) => {
        let newHotKey = ""
        let actionKey = ""
        if (e.metaKey) {
            newHotKey += "m"
        } else if (e.ctrlKey) {
            newHotKey += "c"
        } else if (e.altKey) {
            newHotKey += "a"
        } else if (HotKeySingleKeys.includes(e.key)) {
            actionKey = e.key
        }
        if (newHotKey.length > 0 && e.shiftKey) {
            newHotKey += "i"
        }
        if (newHotKey !== "") {
            actionKey = newHotKey
            if (!HotKeySkipValues.includes(e.key)) {
                actionKey += " " + e.key
            }
        }

        if (e.key !== "Tab") {
            e.preventDefault()
            e.stopPropagation()
        } else return

        if (actionKey === hotKey) {
            return
        }
        setHotKey(actionKey !== "" ? actionKey : null)
    }

    let delAction = null
    if (hotKey && hotKey !== props.hotKey) {
        for (let [currAction, actionHotKey] of Object.entries(mapping)) {
            if (hotKey === actionHotKey) {
                delAction = currAction
            }
        }
    }

    const isHotKeyOnly = (value) => value.match(/^[mca]i?$/)

    const onKeyUp = (e) => {
        if (hotKey !== null && isHotKeyOnly(hotKey)) {
            setHotKey(null)
        }
    }

    const okOp = {
        can: () => hotKey !== null && !isHotKeyOnly(hotKey),
        exec: () => save(hotKey, delAction)
    }

    return (
        <OkCancelLayout ok={okOp.exec} cancel={close}>
            <Stack className="p-2" vertical>
                <div className="text-xs text-center">
                    {'Press HotKey for action "' + action + '":'}
                </div>
                <div className="p-2">
                    <Div
                        onKeyDown={onKeyDown}
                        onKeyUp={onKeyUp}
                        ref={recorderRef}
                        tab
                        className="autofocus border border-1 p-2 focus:outline-none focus:ring focus:ring-focus-border"
                    >
                        <Keys
                            className="justify-center"
                            value={hotKey}
                            emptyMsg="press key(s)"
                        />
                    </Div>
                </div>
                {delAction && (
                    <div className="p-2">
                        <Stack className="p-2 border">
                            <div className="p-2">
                                <Icon name="warning" />
                            </div>
                            <div className="p-2">
                                {`This HotKey is currently assigned to "${delAction}", if you save this assignment gets deleted!`}
                            </div>
                        </Stack>
                    </div>
                )}
            </Stack>
        </OkCancelLayout>
    )
}

function Keys({ value, className, emptyMsg = "not assigned" }) {
    const cls = ClassNames("text-xs", className)

    if (!value) {
        cls.add("opacity-50 text-center")
        return <div className={cls.value}>{emptyMsg}</div>
    }

    const rawKeys = isString(value) ? value.split(" ") : []
    const keys = []
    if (rawKeys.length) {
        let firstKey = rawKeys.shift()
        if (rawKeys.length > 0) {
            switch (firstKey) {
                case "c":
                    firstKey = "Ctrl"
                    break

                case "m":
                    firstKey = "Cmd"
                    break
            }
        }
        keys.push(firstKey)
        if (rawKeys.length > 0) keys.push(...rawKeys)
    }
    cls.add("stack-h gap-2")
    return (
        <Div className={cls.value}>
            {keys.map((item, i) => (
                <Fragment key={i}>
                    {i > 0 && (
                        <div className="py-1 border-1 border-transparent">
                            +
                        </div>
                    )}
                    <div className="bg-input-text/80 px-2 py-1 border border-1 border-app-text/50 rounded-lg">
                        {item}
                    </div>
                </Fragment>
            ))}
        </Div>
    )
}

function KeyBindingsStack({ keyBindingsIndex }) {
    const EditModal = useModalWindow()
    const actions = [
        {
            action: "edit",
            op: {
                exec: (selected) => {
                    const index = selected[0]
                    const model = keyBindingsIndex.getEntityObject(index)
                    EditModal.open({
                        action: model.value,
                        mappings: keyBindingsIndex.model,
                        save: (newKey, delAction) => {
                            if (delAction) {
                                const delIndex =
                                    keyBindingsIndex.getEntityByPropValue(
                                        "value",
                                        delAction
                                    )
                                keyBindingsIndex.deleteEntity(delIndex)
                            }
                            keyBindingsIndex.setEntityPropValue(
                                index,
                                "key",
                                newKey
                            )
                            EditModal.close()
                        }
                    })
                },
                can: (selected) => selected.length === 1
            }
        },
        {
            action: "delete",
            op: {
                exec: (selected) => {
                    for (const index of selected) {
                        keyBindingsIndex.setEntityPropValue(index, "key", "")
                    }
                },
                can: (selected) => selected.length > 0
            }
        }
    ]
    const itemActions = [
        {
            icon: "check",
            action: (index, selected, setSelected) =>
                selected.includes(index)
                    ? setSelected(selected.filter((x) => x !== index))
                    : setSelected([...selected, index])
        },
        {
            icon: "edit",
            action: (index) => actions[0].op.exec([index])
        },
        {
            icon: "delete",
            action: (index) => actions[1].op.exec([index])
        }
    ]

    return (
        <>
            <EntityStack
                entityIndex={keyBindingsIndex}
                actions={actions}
                itemActions={itemActions}
                render={({ value, key }) => {
                    const rawKeys = isString(key) ? key.split(" ") : []
                    const keys = []
                    if (rawKeys.length) {
                        let firstKey = rawKeys.shift()
                        if (rawKeys.length > 0) {
                            switch (firstKey) {
                                case "c":
                                    firstKey = "Ctrl"
                                    break

                                case "m":
                                    firstKey = "Cmd"
                                    break
                            }
                        }
                        keys.push(firstKey)
                        if (rawKeys.length > 0) keys.push(...rawKeys)
                    }
                    return (
                        <Stack key={value} className="gap-4">
                            <div className="stack-h text-app-text text-xs gap-2">
                                <Div className="text-sm px-2" minWidth="68px">
                                    {value}
                                </Div>

                                <Keys value={key} />
                            </div>
                        </Stack>
                    )
                }}
            />
            <EditModal.content name="Edit key binding">
                <KeyBindingEdit {...EditModal.props} />
            </EditModal.content>
        </>
    )
}

function KeyBindings({ keyBindingsIndex }) {
    return (
        <FormGrid>
            <SectionCells name="Key Bindings" />
            <FullCell>
                <KeyBindingsStack keyBindingsIndex={keyBindingsIndex} />
            </FullCell>
        </FormGrid>
    )
}

const defaultSettings = {
    layout: {
        width: 800,
        height: 800,
        wMax: true,
        hMax: true,
        sidebar: false
    }
}

function Settings({ close }) {
    const aContext = useContext(AppContext)
    const [layout, setLayoutRaw] = useState(() => {
        return { ...defaultSettings.layout }
    })
    const applyLayout = ({ width, height, wMax, hMax, sidebar }) => {
        root.style.setProperty("--app-max-width", wMax ? "100%" : width + "px")
        root.style.setProperty(
            "--app-max-height",
            hMax ? "100%" : height + "px"
        )
    }
    const setLayout = (newLayout) => {
        applyLayout(newLayout)
        setLayoutRaw(newLayout)
    }
    const [theme, setThemeRaw] = useState(() => {
        return { ...themeManager.currentTheme }
    })
    const applyTheme = (props) => {
        themeManager.apply(props)
    }
    const setTheme = (newTheme) => {
        applyTheme(newTheme)
        setThemeRaw(newTheme)
    }
    const [general, setGeneral] = useState(() => {
        const { apiEnvs, ...other } = aContext.globalSettings
        return cloneDeep(other)
    })
    const pluginIndex = useMemo(
        () => new PluginIndex(aContext.plugins),
        [aContext.plugins]
    )
    const apiEnvIndex = useMemo(
        () =>
            new ApiEnvIndex(aContext.apiSettings.apiEnvs)[
                aContext.apiSettings.apiEnvs
            ]
    )
    const keyBindingsIndex = useMemo(
        () => new SimpleMappingIndex(aContext.keyBindings, "key"),
        [aContext.keyBindings]
    )

    const backedUpSettings = useRef(null)
    const confirm = useConfirmation()
    const resetToDefaults = () => {
        confirm.open({
            msg: "Do you really want to reset all settings to the default values?",
            confirmed: () => {
                setGeneral(defaultGlobalSettings)
                setLayout(defaultSettings.layout)
                setTheme(themeManager.defaultTheme)
                apiEnvIndex.setModel(defaultApiSettings.apiEnvs)
                pluginIndex.setModel(PluginRegistry.getDefaultStates())
                keyBindingsIndex.setModel(defaultKeyBindings)
            }
        })
    }

    const getSnapshot = () => {
        return {
            layout: { ...layout },
            general: cloneDeep(general),
            apiEnvs: cloneDeep(apiEnvIndex.model),
            plugins: cloneDeep(pluginIndex.model),
            keyBindings: cloneDeep(keyBindingsIndex.model),
            theme: { ...theme }
        }
    }

    const beforeSettings = useMemo(() => getSnapshot(), [])

    const applySettings = ({ layout, theme }) => {
        applyLayout(layout)
        applyTheme(theme)
    }
    const store = (storage, key, settings, defaultSettings) => {
        if (JSON.stringify(settings) === JSON.stringify(defaultSettings)) {
            storage.deleteJson(key)
        } else {
            storage.setJson(key, settings)
        }
    }
    return (
        <>
            <OkCancelLayout
                submit
                scroll={false}
                cancel={() => {
                    applySettings(beforeSettings)
                    close()
                }}
                ok={() => {
                    themeManager.store()
                    store(
                        aContext.globalStorage,
                        "settings",
                        general,
                        defaultGlobalSettings
                    )
                    store(
                        aContext.apiStorage,
                        "settings",
                        {
                            apiEnvs: apiEnvIndex.model
                        },
                        defaultApiSettings
                    )
                    aContext.apiStorage.setJson("plugins", pluginIndex.model)
                    aContext.apiStorage.setJson(
                        "keyBindings",
                        keyBindingsIndex.model
                    )
                    close()
                    aContext.rebuildSettings(true)
                }}
                buttons={[
                    {
                        name: "Before",
                        icon: "visibility",
                        onPressed: () => {
                            backedUpSettings.current = getSnapshot()
                            setGeneral(beforeSettings.general)
                            setLayout(beforeSettings.layout)
                            setTheme(beforeSettings.theme)
                            apiEnvIndex.setModel(beforeSettings.apiEnvs)
                            pluginIndex.setModel(beforeSettings.plugins)
                            keyBindingsIndex.setModel(
                                beforeSettings.keyBindings
                            )
                        },
                        onPressedEnd: () => {
                            setGeneral(backedUpSettings.current.general)
                            setLayout(backedUpSettings.current.layout)
                            setTheme(backedUpSettings.current.theme)
                            apiEnvIndex.setModel(
                                backedUpSettings.current.apiEnvs
                            )
                            pluginIndex.setModel(
                                backedUpSettings.current.plugins
                            )
                            keyBindingsIndex.setModel(
                                backedUpSettings.current.keyBindings
                            )
                        }
                    }
                ]}
                secondaryButtons={[
                    { name: "Reset to defaults", onPressed: resetToDefaults }
                ]}
            >
                <Tabs persistId="settings" autoFocus>
                    <Tab name="General" active>
                        <General
                            general={general}
                            setGeneral={setGeneral}
                            apiEnvIndex={apiEnvIndex}
                        />
                    </Tab>

                    <Tab name="Plugins">
                        <PluginsOverview pluginIndex={pluginIndex} />
                    </Tab>

                    <Tab name="Layout">
                        <Layout layout={layout} setLayout={setLayout} />
                    </Tab>

                    <Tab name="Theme">
                        <Theme theme={theme} setTheme={setTheme} />
                    </Tab>

                    <Tab name="Key bindings">
                        <KeyBindings keyBindingsIndex={keyBindingsIndex} />
                    </Tab>

                    <Tab name="About">
                        <About />
                    </Tab>
                </Tabs>
            </OkCancelLayout>
            {confirm.Modals}
        </>
    )
}

export {
    Settings,
    defaultApiSettings,
    defaultGlobalSettings,
    defaultKeyBindings
}
