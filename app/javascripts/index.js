import $ from "jquery"
import ace from 'brace'
import URI from 'urijs'
import 'history'
import 'jquery.hotkeys'

import 'brace/mode/json'
import 'brace/theme/github'

import "./css/index.css"

$(function () {
  var updateSchema = function () {
    $.get("/render-schema")
      .done(function (res) {
        $("#schema pre").html(res)
      })
      .fail(function (error) {
        console.error(error)
      })
  };

  var examples = {
    factionsAndShips: {
      query: "query FactionsAndShips {\n  factions(names:[\"empire\",\"rebels\"]) {\n    name\n    ships{\n      edges{\n        node{\n          name\n        }\n      }\n    }\n  }\n}"
    },

    fullIntrospection: {
      query: 'query IntrospectionQuery {\n  __schema {\n    queryType { name }\n    mutationType { name }\n    subscriptionType { name }\n    types {\n    ...FullType\n    }\n    directives {\n      name\n      description\n      args {\n      ...InputValue\n      }\n      onOperation\n      onFragment\n      onField\n    }\n  }\n}\nfragment FullType on __Type {\n  kind\n  name\n  description\n  fields(includeDeprecated: true) {\n    name\n    description\n    args {\n    ...InputValue\n    }\n    type {\n    ...TypeRef\n    }\n    isDeprecated\n    deprecationReason\n  }\n  inputFields {\n  ...InputValue\n  }\n  interfaces {\n  ...TypeRef\n  }\n  enumValues(includeDeprecated: true) {\n    name\n    description\n    isDeprecated\n    deprecationReason\n  }\n  possibleTypes {\n  ...TypeRef\n  }\n}\nfragment InputValue on __InputValue {\n  name\n  description\n  type { ...TypeRef }\n  defaultValue\n}\nfragment TypeRef on __Type {\n  kind\n  name\n  ofType {\n    kind\n    name\n    ofType {\n      kind\n      name\n      ofType {\n        kind\n        name\n      }\n    }\n  }\n}'
    },

    mutationWithInput: {
      query: "mutation AddBWingQuery($input: IntroduceShipInput!) {\n  introduceShip(input: $input) {\n    ship {\n      id\n      name\n    }\n    faction {\n      name\n    }\n    clientMutationId\n  }\n}",
      args: '{\n  "input": {\n    "shipName": "B-Wing",\n    "factionId": "1",\n    "clientMutationId": "abcde"\n  }\n}'
    },

    fragmentsExample: {
      query: 'query FragmentExample {\n  rebels {\n    ...Common\n  }\n\n  empire {\n    ...Common\n  }\n}\n\nfragment Common on Faction {\n  id\n  name\n}'
    }
  };

  var editorTheme = "ace/theme/github";
  var initialQuery = "query FactionsAndShips {\n  factions(names:[\"empire\",\"rebels\"]) {\n    name\n    ships{\n      edges{\n        node{\n          name\n        }\n      }\n    }\n  }\n}";

  var createEditor = function (id, mode, readOnly) {
    var editor = ace.edit(id);

    editor.setTheme(editorTheme);
    editor.getSession().setOptions({
      mode: "ace/mode/" + mode,
      tabSize: 2,
      useSoftTabs: true
    });
    editor.setDisplayIndentGuides(true);
    editor.setFontSize(17);

    if (readOnly) editor.setReadOnly(readOnly);

    return editor
  };

  updateSchema();

  var queryEditor = createEditor("queryEditor", "text");
  var variablesEditor = createEditor("variablesEditor", "json");
  var responseEditor = createEditor("responseEditor", "json", true);

  queryEditor.setValue(initialQuery, -1);

  var updateFromUrl = function (url) {
    var params = new URI(url ? url : document.location).search(true);

    if (params.query)
      queryEditor.setValue(params.query, -1);

    if (params.args) {
      variablesEditor.setValue(params.args, -1);
      $("#variablesSection").collapse('show')
    } else {
      variablesEditor.setValue("", -1);
      $("#variablesSection").collapse('hide')
    }

    if (params.operationName)
      $("#operation").val(params.operationName)
  };

  var execute = function () {
    var queryParams = {
      query: queryEditor.getValue()
    };

    if (variablesEditor.getValue().trim() !== '')
      queryParams.variables = variablesEditor.getValue().trim();

    if ($("#operation").val() && $("#operation").val().trim !== '')
      queryParams.operationName = $("#operation").val();

    var url = $("#graphqlUrl").val();


    $.get(url, queryParams)
      .done(function (res) {
        responseEditor.setValue(JSON.stringify(res, null, 2), -1);

        if (res.errors && res.errors.length > 0) {
          $("#responseError").html("");

          for (var i = 0; i < res.errors.length; i++) {
            $("#responseError").append($("<pre>").html(res.errors[i].message))
          }

          $("#errors").collapse('show')
        } else {
          $("#errors").collapse('hide')
        }

        $("#response").collapse('show')
      })
      .fail(function (error) {
        if (error.status === 400 && error.responseJSON && error.responseJSON.syntaxError)
          $("#responseError").html($("<pre>").html(error.responseJSON.syntaxError));

        $("#response").collapse('hide');
        $("#errors").collapse('show')
      })
  };

  var showShortcuts = function () {
    $("#hotkeysDialog").modal()
  };

  var toggleVariables = function () {
    $("#variablesSection").collapse('toggle')
  };

  var toggleConfig = function () {
    $("#configSection").collapse('toggle')
  };

  $("#runButton").on("click", execute);
  $(document).bind("keydown", "shift+/", showShortcuts);
  $(document).bind("keydown", "ctrl+return", execute);
  $(document).bind("keydown", "v", toggleVariables);
  $(document).bind("keydown", "c", toggleConfig);
  $(".ace_editor textarea").bind("keydown", "ctrl+return", execute);


  updateFromUrl();

  console.info(History, History.Adapter);

  History.Adapter.bind(window, 'statechange', function () {
    updateFromUrl(History.getState().url)
  });

  var setState = function (query) {
    History.pushState({state: 1}, document.title, new URI().search(query).search())
  };

  $(".exampleLink").click(function (e) {
    e.preventDefault();

    if (examples[e.target.id])
      setState(examples[e.target.id])
  });

  $("#permalink").click(function () {
    var queryParams = {
      query: queryEditor.getValue()
    };

    if (variablesEditor.getValue().trim() !== '')
      queryParams.args = variablesEditor.getValue().trim();

    if ($("#operation").val() && $("#operation").val().trim !== '')
      queryParams.operationName = $("#operation").val();

    History.pushState({state: 1}, document.title, new URI().search(queryParams).search())
  })
});