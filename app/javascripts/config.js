import _ from 'lodash'

export class State {
  constructor(key, initial) {
    this.key = key
    this.state = {}

    const restored = this.restoreState()

    this.setState(initial)
    this.setState(restored)
  }

  setState(s) {
    for (let key of Object.keys(s)) {
      this.state[key] = s[key]
      this[key] = s[key]

      this.setItem(key, s[key])
    }

    return this
  }

  restoreState() {
    var res = {}

    for (var key in localStorage) {
      if (key.startsWith(this.prefix())) {
        const name = key.substring(this.prefix().length)

        res[name] = this.getItem(name)
      }
    }

    return res
  }

  cleanupState() {
    for (var key in localStorage) {
      if (key.startsWith(this.prefix())) {
        localStorage.removeItem(key)
      }
    }

    this.freeze = true
  }

  prefix() {
    return this.key + "-"
  }

  setItem(key, val) {
    if (!this.freeze) {
      this.state[key] = val
      this[key] = val

      return localStorage.setItem(this.prefix() + key, JSON.stringify({data: val}))
    }
  }

  getItem(key) {
    const value = localStorage.getItem(this.prefix() + key)

    if (value)
      return JSON.parse(value).data
    else
      return undefined
  }
}

export class AppConfig {
  constructor(key) {
    if (typeof key === "string") {
      this.state = new State(key, {
        key: key,
        lastId: 0,
        tabIds: [],
        closedTabs: [],
        defaultUrl: "http://try.sangria-graphql.org/graphql",
        defaultProxy: false,
        defaultHeaders: [],
        usedUrls: [],
        recentHeaders: [],
        maxTabHistory: 20,
        maxUrlHistory: 20
      })

      this.tabInfo = this.state.tabIds.map(id => new TabConfig(id))
    } else {
      const tabs = key.tabs
      const doc = _.omit(key, ["tabs"])

      this.state = new State(doc.key, doc)

      this.tabInfo = tabs.map(t => new TabConfig(t))
    }
  }

  export() {
    var ownState = this.state.state

    ownState.tabs = this.tabInfo.map(t => t.state.state)

    return ownState
  }

  rememberUrl(url) {
    if (this.state.usedUrls.indexOf(url) < 0) {
      if (this.state.usedUrls.length >= this.state.maxUrlHistory)
        this.state.setState({usedUrls: _.dropRight(this.state.usedUrls)})

      this.state.setState({
        usedUrls: [url, ...this.state.usedUrls]
      })

      return true
    } else {
      return false
    }
  }

  rememberHeader(header) {
    const simplified = this.state.recentHeaders.map(h => h.name + h.value)

    if (simplified.indexOf(header.name + header.value) < 0) {
      if (this.state.recentHeaders.length >= 20)
        this.state.setState({recentHeaders: _.dropRight(this.state.recentHeaders)})

      this.state.setState({
        recentHeaders: [header, ...this.state.recentHeaders]
      })

      return true
    } else {
      return false
    }
  }

  addTab() {
    const id = this.genId()
    const key = "tab" + id
    const tab = new TabConfig(key, "Query " + (this.state.tabIds.length + 1), this.state.defaultUrl, this.state.defaultProxy, this.state.defaultHeaders)

    this.tabInfo.push(tab)
    this.state.setState({
      tabIds: [...this.state.tabIds, key],
      activeId: key
    })

    return tab
  }

  getActiveId() {
    return this.state.activeId
  }

  removeTab(id) {
    var idx = -1

    this.tabInfo.forEach((e, i) => {
      if (e.getId() === id) {
        this.rememberTab(e)
        e.cleanup()
        idx = i
      }
    })

    this.tabInfo.splice(idx, 1)
    this.state.tabIds.splice(idx, 1)

    this.state.setState({tabIds: this.state.tabIds})

    let newTab = null

    if (this.tabInfo.length == 0) {
      newTab = this.addTab()
    } else {
      if (this.getActiveId() == id) {
        const activeIdx = idx == this.tabInfo.length ? idx - 1 : idx
        this.state.setState({activeId: this.tabInfo[activeIdx].getId()})
      }
    }

    return newTab
  }

  rememberTab(tab) {
    console.info(tab.state.state)
    if (this.state.closedTabs.length >= this.state.maxTabHistory)
      this.state.setState({closedTabs: _.dropRight(this.state.closedTabs)})

    this.state.setState({closedTabs: [tab.state.state, ...this.state.closedTabs]})
  }

  reopenTab() {
    if (this.state.closedTabs.length > 0) {
      const tabConf = this.state.closedTabs.shift()
      const tab = new TabConfig(tabConf)

      this.tabInfo.push(tab)
      this.state.setState({
        tabIds: [...this.state.tabIds, tab.getId()],
        activeId: tab.getId()
      })

      this.state.setState({closedTabs: this.state.closedTabs})

      return tab
    }
  }

  getTabs() {
    return this.tabInfo
  }

  genId() {
    this.state.setState({lastId: this.state.lastId + 1})

    return "" + this.state.lastId
  }

  getState() {
    return this.state
  }

  cleanup() {
    this.tabInfo.forEach(t => t.cleanup())
    this.state.cleanupState()
  }
}

export class TabConfig {
  constructor(key, name, url, proxy, headers) {
    if (typeof key === "string") {
      this.state = new State(key, {
        id: key,
        name: name,
        url: url,
        proxy: proxy,
        headers: headers
      })
    } else {
      // restoring
      this.state = new State(key.id, key)
    }
  }

  getId() {
    return this.state.id
  }

  cleanup() {
    this.state.cleanupState()
  }

  getState() {
    return this.state
  }
}