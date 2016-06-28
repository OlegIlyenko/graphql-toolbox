const ExtractTextPlugin = require('extract-text-webpack-plugin');
const webpack = require("webpack");

var PROD = JSON.parse(process.env.PROD_ENV || 'false');

module.exports = {
  entry: {
    format: ['whatwg-fetch', "./app/javascripts/format.jsx"],
    proxy: ['whatwg-fetch', 'bootstrap-loader/extractStyles', "./app/javascripts/proxy.jsx"],
    index: ['bootstrap-loader/extractStyles', "./app/javascripts/index.js"]
  },

  devtool: 'source-map',

  output: {
    path: __dirname + "/public/",
    publicPath: "/assets/",
    filename: "[name].js"
  },

  resolve: {
    extensions: ['', '.webpack.js', '.web.js', '.ts', '.js'],
    alias: {
      history: 'historyjs/scripts/bundled-uncompressed/html4+html5/jquery.history'
    }
  },

  plugins: [
    new ExtractTextPlugin('[name].css', {allChunks: true}),
    new webpack.ProvidePlugin({"window.jQuery": "jquery"})
  ].concat(
    PROD ? [new webpack.optimize.UglifyJsPlugin({compress: {warnings: false }})] : []
  ),

  module: {
    loaders: [
      {
        test: /\.jsx?$/, exclude: /node_modules/, loader: 'babel-loader',
        query: {presets: ['react', 'es2015', 'stage-0']}
      },
      {test: /\.scss$/, loader: ExtractTextPlugin.extract("style", "css?sourceMap!sass?sourceMap")},
      {test: /\.css$/, loader: ExtractTextPlugin.extract('style', 'css')},
      {test: /\.(woff2?|ttf|eot|svg)$/, loader: 'url?limit=10000'},
      {test: /bootstrap-sass[\\\/].*\.js/, loader: 'imports?jQuery=jquery'},
      {test: /jquery.hotkeys[\\\/].*\.js/, loader: 'imports?jQuery=jquery'}
    ]
  }
};