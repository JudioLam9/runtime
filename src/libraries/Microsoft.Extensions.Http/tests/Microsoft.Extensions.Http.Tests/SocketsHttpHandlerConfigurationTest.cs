// Licensed to the .NET Foundation under one or more agreements.
// The .NET Foundation licenses this file to you under the MIT license.

#if NET5_0_OR_GREATER
using System;
using System.Collections.Generic;
using System.Net.Http;
using System.Net.Security;
using System.Threading;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Xunit;

namespace Microsoft.Extensions.Http
{
    public class SocketsHttpHandlerConfigurationTest
    {
        private const string ParentSectionName = "HttpClientSettings";
        private const string SectionName = "ConfiguredByIConfiguration";
        private static Dictionary<string, string> s_configContent = new Dictionary<string, string>
        {
            { $"{ParentSectionName}:{SectionName}:AllowAutoRedirect", "true" },
            { $"{ParentSectionName}:{SectionName}:UseCookies", "false" },
            { $"{ParentSectionName}:{SectionName}:ConnectTimeout", "00:00:05" },
            { $"{ParentSectionName}:{SectionName}:PooledConnectionLifetime", "00:01:00" },
            { $"{ParentSectionName}:{SectionName}:SomeUnrelatedProperty", "WillBeIgnored" }
        };

        [ConditionalFact(typeof(PlatformDetection), nameof(PlatformDetection.IsNotBrowser))]
        public void UseSocketsHttpHandler_Parameterless_Success()
        {
            var serviceCollection = new ServiceCollection();
            serviceCollection.AddHttpClient("DefaultPrimaryHandler");

            serviceCollection.AddHttpClient("SocketsHttpHandler")
                .UseSocketsHttpHandler();

            var services = serviceCollection.BuildServiceProvider();
            var messageHandlerFactory = services.GetRequiredService<IHttpMessageHandlerFactory>();

            var defaultPrimaryHandlerChain = messageHandlerFactory.CreateHandler("DefaultPrimaryHandler");
            var socketsHttpHandlerChain = messageHandlerFactory.CreateHandler("SocketsHttpHandler");

            Assert.IsType<HttpClientHandler>(GetPrimaryHandler(defaultPrimaryHandlerChain));
            Assert.IsType<SocketsHttpHandler>(GetPrimaryHandler(socketsHttpHandlerChain));
        }

        [ConditionalFact(typeof(PlatformDetection), nameof(PlatformDetection.IsNotBrowser))]
        public void UseSocketsHttpHandler_ConfiguredByAction_Success()
        {
            var serviceCollection = new ServiceCollection();

            serviceCollection.AddHttpClient("Unconfigured")
                .UseSocketsHttpHandler();

            serviceCollection.AddHttpClient("ConfiguredByAction")
                .UseSocketsHttpHandler((handler, _) => handler.PooledConnectionLifetime = TimeSpan.FromMinutes(1));

            var services = serviceCollection.BuildServiceProvider();
            var messageHandlerFactory = services.GetRequiredService<IHttpMessageHandlerFactory>();

            var unconfiguredHandlerChain = messageHandlerFactory.CreateHandler("Unconfigured");
            var configuredHandlerChain = messageHandlerFactory.CreateHandler("ConfiguredByAction");

            var unconfiguredHandler = (SocketsHttpHandler)GetPrimaryHandler(unconfiguredHandlerChain);
            var configuredHandler = (SocketsHttpHandler)GetPrimaryHandler(configuredHandlerChain);

            Assert.Equal(Timeout.InfiniteTimeSpan, unconfiguredHandler.PooledConnectionLifetime);
            Assert.Equal(TimeSpan.FromMinutes(1), configuredHandler.PooledConnectionLifetime);
        }

        [ConditionalFact(typeof(PlatformDetection), nameof(PlatformDetection.IsNotBrowser))]
        public void UseSocketsHttpHandler_ConfiguredByBuilder_Success()
        {
            var serviceCollection = new ServiceCollection();

            serviceCollection.AddHttpClient("Unconfigured")
                .UseSocketsHttpHandler();

            serviceCollection.AddHttpClient("ConfiguredByBuilder")
                .UseSocketsHttpHandler(builder =>
                    builder.Configure((handler, _) => handler.ConnectTimeout = TimeSpan.FromSeconds(10)));

            var services = serviceCollection.BuildServiceProvider();
            var messageHandlerFactory = services.GetRequiredService<IHttpMessageHandlerFactory>();

            var unconfiguredHandlerChain = messageHandlerFactory.CreateHandler("Unconfigured");
            var configuredHandlerChain = messageHandlerFactory.CreateHandler("ConfiguredByBuilder");

            var unconfiguredHandler = (SocketsHttpHandler)GetPrimaryHandler(unconfiguredHandlerChain);
            var configuredHandler = (SocketsHttpHandler)GetPrimaryHandler(configuredHandlerChain);

            Assert.Equal(Timeout.InfiniteTimeSpan, unconfiguredHandler.ConnectTimeout);
            Assert.Equal(TimeSpan.FromSeconds(10), configuredHandler.ConnectTimeout);
        }

        [ConditionalFact(typeof(PlatformDetection), nameof(PlatformDetection.IsNotBrowser))]
        public void UseSocketsHttpHandler_ConfiguredByIConfiguration_Success()
        {
            IConfiguration config = new ConfigurationBuilder()
                .AddInMemoryCollection(s_configContent)
                .Build();

            var serviceCollection = new ServiceCollection();

            serviceCollection.AddHttpClient(SectionName)
                .UseSocketsHttpHandler(builder =>
                    builder.Configure(config.GetSection($"{ParentSectionName}:{SectionName}")));

            var services = serviceCollection.BuildServiceProvider();
            var messageHandlerFactory = services.GetRequiredService<IHttpMessageHandlerFactory>();

            var configuredHandlerChain = messageHandlerFactory.CreateHandler(SectionName);
            var configuredHandler = (SocketsHttpHandler)GetPrimaryHandler(configuredHandlerChain);

            Assert.True(configuredHandler.AllowAutoRedirect);
            Assert.False(configuredHandler.UseCookies);
            Assert.Equal(TimeSpan.FromSeconds(5), configuredHandler.ConnectTimeout);
            Assert.Equal(TimeSpan.FromMinutes(1), configuredHandler.PooledConnectionLifetime);
        }

        [ConditionalFact(typeof(PlatformDetection), nameof(PlatformDetection.IsNotBrowser))]
        public void UseSocketsHttpHandler_ChainingActionAfterIConfiguration_Updates()
        {
            IConfiguration config = new ConfigurationBuilder()
                .AddInMemoryCollection(s_configContent)
                .Build();

            var serviceCollection = new ServiceCollection();

            var allowAllCertsSslOptions = new SslClientAuthenticationOptions
            {
                RemoteCertificateValidationCallback = delegate { return true; }
            };

            serviceCollection.AddHttpClient("ActionAfterIConfiguration")
                .UseSocketsHttpHandler(builder =>
                    builder.Configure(config.GetSection($"{ParentSectionName}:{SectionName}"))
                        .Configure((handler, _) =>
                        {
                            handler.ConnectTimeout = TimeSpan.FromSeconds(10); // will overwrite value from IConfiguration
                            handler.SslOptions = allowAllCertsSslOptions;
                        }));

            var services = serviceCollection.BuildServiceProvider();
            var messageHandlerFactory = services.GetRequiredService<IHttpMessageHandlerFactory>();

            var configuredHandlerChain = messageHandlerFactory.CreateHandler("ActionAfterIConfiguration");
            var configuredHandler = (SocketsHttpHandler)GetPrimaryHandler(configuredHandlerChain);

            Assert.True(configuredHandler.AllowAutoRedirect); // from IConfiguration
            Assert.False(configuredHandler.UseCookies); // from IConfiguration
            Assert.Equal(TimeSpan.FromSeconds(10), configuredHandler.ConnectTimeout); // overwritten by action
            Assert.Equal(TimeSpan.FromMinutes(1), configuredHandler.PooledConnectionLifetime); // from IConfiguration
            Assert.Equal(allowAllCertsSslOptions, configuredHandler.SslOptions); // from action
        }

        [ConditionalFact(typeof(PlatformDetection), nameof(PlatformDetection.IsNotBrowser))]
        public void UseSocketsHttpHandler_ChainingIConfigurationAfterAction_Updates()
        {
            IConfiguration config = new ConfigurationBuilder()
                .AddInMemoryCollection(s_configContent)
                .Build();

            var serviceCollection = new ServiceCollection();

            var allowAllCertsSslOptions = new SslClientAuthenticationOptions
            {
                RemoteCertificateValidationCallback = delegate { return true; }
            };

            serviceCollection.AddHttpClient("IConfigurationAfterAction")
                .UseSocketsHttpHandler(builder =>
                    builder.Configure((handler, _) =>
                        {
                            handler.ConnectTimeout = TimeSpan.FromSeconds(10); // will be overwrittten by IConfiguration
                            handler.SslOptions = allowAllCertsSslOptions;
                        })
                        .Configure(config.GetSection($"{ParentSectionName}:{SectionName}")));

            var services = serviceCollection.BuildServiceProvider();
            var messageHandlerFactory = services.GetRequiredService<IHttpMessageHandlerFactory>();

            var configuredHandlerChain = messageHandlerFactory.CreateHandler("IConfigurationAfterAction");
            var configuredHandler = (SocketsHttpHandler)GetPrimaryHandler(configuredHandlerChain);

            Assert.True(configuredHandler.AllowAutoRedirect); // from IConfiguration
            Assert.False(configuredHandler.UseCookies); // from IConfiguration
            Assert.Equal(TimeSpan.FromSeconds(5), configuredHandler.ConnectTimeout); // overwritten by IConfiguration
            Assert.Equal(TimeSpan.FromMinutes(1), configuredHandler.PooledConnectionLifetime); // from IConfiguration
            Assert.Equal(allowAllCertsSslOptions, configuredHandler.SslOptions); // from action
        }

        [ConditionalTheory(typeof(PlatformDetection), nameof(PlatformDetection.IsNotBrowser))]
        [InlineData(false)]
        [InlineData(true)]
        public void UseSocketsHttpHandler_PresetSocketsHttpHandler_Updates(bool handlerSetByUseSocketsHttpHandler)
        {
            var serviceCollection = new ServiceCollection();

            var builder = serviceCollection.AddHttpClient("SocketsHttpHandler");

            if (handlerSetByUseSocketsHttpHandler)
            {
                builder.UseSocketsHttpHandler((handler, _) => handler.PooledConnectionLifetime = TimeSpan.FromMinutes(10));
            }
            else
            {
                builder.ConfigurePrimaryHttpMessageHandler(() =>
                {
                    var handler = new SocketsHttpHandler();
                    handler.PooledConnectionLifetime = TimeSpan.FromMinutes(10);
                    return handler;
                });
            }

            var allowAllCertsSslOptions = new SslClientAuthenticationOptions
            {
                RemoteCertificateValidationCallback = delegate { return true; }
            };

            builder.UseSocketsHttpHandler((handler, _) =>
            {
                handler.SslOptions = allowAllCertsSslOptions; // this will update existing SocketsHttpHandler
            });

            var services = serviceCollection.BuildServiceProvider();
            var messageHandlerFactory = services.GetRequiredService<IHttpMessageHandlerFactory>();

            var configuredHandlerChain = messageHandlerFactory.CreateHandler("SocketsHttpHandler");
            var configuredHandler = (SocketsHttpHandler)GetPrimaryHandler(configuredHandlerChain);

            Assert.Equal(TimeSpan.FromMinutes(10), configuredHandler.PooledConnectionLifetime); // from initial config
            Assert.Equal(allowAllCertsSslOptions, configuredHandler.SslOptions); // from second config
        }

        private HttpMessageHandler GetPrimaryHandler(HttpMessageHandler handlerChain)
        {
            var handler = handlerChain;
            while (handler is DelegatingHandler delegatingHandler)
            {
                handler = delegatingHandler.InnerHandler;
            }
            return handler;
        }
    }
}
#endif
