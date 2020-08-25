const webpack = require('webpack')
const path = require('path')
const ReactiveTsxTransformer = require('reactive-tsx/lib/transformer').default
const HtmlWebpackPlugin = require('html-webpack-plugin')

const config = {
    entry: './src/index.tsx',
    output: {
        path: path.resolve(__dirname, 'dist'),
        filename: 'bundle.js?[hash]'
    },
    module: {
        rules: [
            {
                test: /\.tsx?$/,
                loader: 'ts-loader',
                exclude: /node_modules/,
                options: {
                    getCustomTransformers: program => ({
                        before: [ReactiveTsxTransformer(program)]
                    })
                }
            },
        ]
    },
    resolve: {
        extensions: ['.tsx', '.ts', '.js']
    },
    plugins: [
        new HtmlWebpackPlugin({
            template: path.resolve(__dirname, './src/index.html')
        })
    ]
}

module.exports = config
