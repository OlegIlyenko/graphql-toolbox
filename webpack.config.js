const ExtractTextPlugin = require('extract-text-webpack-plugin');
const webpack = require("webpack");

var PROD = JSON.parse(process.env.PROD_ENV || 'false');

module.exports = {
  entry: {
    format: ['whatwg-fetch', "./app/javascripts/format.jsx"],
    proxy: ['whatwg-fetch', "./app/javascripts/proxy.jsx"],
    graphiql: ['whatwg-fetch', "./app/javascripts/graphiql-workspace.jsx"],
    index: ["./app/javascripts/index.js"]
  },

  devtool: 'source-map',

  output: {
    path: __dirname + "/public/",
    publicPath: "/assets/",
    filename: "[name].js",
    library: '[name]'
  },

  resolve: {
    extensions: ['.webpack.js', '.web.js', '.ts', '.js'],
    alias: {
      history: 'historyjs/scripts/bundled-uncompressed/html4+html5/jquery.history'
    }
  },

  plugins: [
    new ExtractTextPlugin({filename: '[name].css', allChunks: true}),
    new webpack.ProvidePlugin({"window.jQuery": "jquery"})
  ].concat(
    PROD ? [new webpack.optimize.UglifyJsPlugin({compress: {warnings: false }})] : []
  ),

  watchOptions: {
    aggregateTimeout: 10
  },

  module: {
    rules: [
      {
        test: /\.jsx?$/, exclude: /node_modules/, loader: 'babel-loader',
        query: {presets: ['react', 'es2015', 'stage-0']}
      },
      {test: /\.scss$/, loader: ExtractTextPlugin.extract({fallback: 'style-loader', loader: 'css-loader?sourceMap!sass-loader?sourceMap'})},
      {test: /\.css$/, loader: ExtractTextPlugin.extract({fallback: 'style-loader', loader: 'css-loader'})},
      {test: /\.(woff2?|ttf|eot|svg)$/, loader: 'url-loader?limit=10000'},
      {test: /bootstrap-sass[\\\/].*\.js/, loader: 'imports-loader?jQuery=jquery'},
      {test: /jquery.hotkeys[\\\/].*\.js/, loader: 'imports-loader?jQuery=jquery'}
    ]
  }
};