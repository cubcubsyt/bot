// ========== BUTTON & MODAL HANDLERS ========== //
async function handleGuideButton(interaction) {
  const guideEmbed = new EmbedBuilder()
    .setColor(0x5865f2)
    .setTitle('📘 REDEMPTION GUIDE')
    .setDescription(
      '1) Buy your key from the website\n' +
      '2) The key will be sent to your email.\n' +
      '3) Press "Redeem Key" in this channel and paste in your key\n' +
      '4) If it doesn\'t work, ask for a new one in ・contact-us.\n' +
      '5) Generators = role for purchased time.\n' +
      '6) One-time items (like vouchers) are sent to your DMs\n' +
      '7) Commands: /help(first letter of store)\n' +
      '8) Barcodes are sent to your DMs.'
    );
  await interaction.reply({ embeds: [guideEmbed], flags: MessageFlags.Ephemeral });
}

async function handleBarcodeGuideButton(interaction) {
  const guideEmbed = new EmbedBuilder()
    .setColor(0x5865f2)
    .setTitle('📘 BARCODE USAGE GUIDE')
    .setDescription(
      '1) Get barcode ready - find the exact product you generated in store\n' +
      '2) Go to ***SELF-CHECKOUT*** once there make sure you got your barcode ready\n' +
      '3) Make sure your phone\'s brightness is 100%\n' +
      '4) Scan the barcode on your phone instead of the barcode on the product\n' +
      '5) The self checkout machine should read the barcode and mark it as scanned\n' +
      '6) Once that\'s done, place the product in the bagging area and pay the small charge\n' +
      '7) Take pictures and enjoy\n\n' +
      '**END OF GUIDE**'
    );
  await interaction.reply({ embeds: [guideEmbed], flags: MessageFlags.Ephemeral });
}

async function handleRedeemButton(interaction) {
  const modal = new ModalBuilder()
    .setCustomId('redeem-modal')
    .setTitle('Redeem Your Key');
  const keyInput = new TextInputBuilder()
    .setCustomId('keyInput')
    .setLabel('Enter your redemption key:')
    .setStyle(TextInputStyle.Short)
    .setRequired(true);
  modal.addComponents(new ActionRowBuilder().addComponents(keyInput));
  await interaction.showModal(modal);
}

async function handleSetupKeySelect(interaction) {
  if (!await isAdmin(interaction)) {
    return interaction.reply({ content: '❌ Admin only', flags: MessageFlags.Ephemeral });
  }
  const roleName = interaction.values[0];
  const key = generateSetupKey();
  saveKey(key, roleName, interaction.user.tag);
  const embed = new EmbedBuilder()
    .setTitle('✅ Key Generated')
    .setDescription(`Generated key for role: **${roleName}**`)
    .addFields(
      { name: 'Key', value: `\`${key}\``, inline: true },
      { name: 'Role', value: roleName, inline: true }
    )
    .setColor(0x00FF00);
  const row = new ActionRowBuilder()
    .addComponents(
      new StringSelectMenuBuilder()
        .setCustomId('setup-key-select-disabled')
        .setPlaceholder('Key generated - disabled')
        .setDisabled(true)
        .addOptions([{ label: roleName, value: roleName }])
    );
  await interaction.update({ embeds: [embed], components: [row] });
}

async function handleRedeemModal(interaction) {
  const key = interaction.fields.getTextInputValue('keyInput');
  const guild = interaction.guild;
  if (redeemedKeys.has(key)) {
    return interaction.reply({
      embeds: [new EmbedBuilder()
        .setTitle('❌ Already Redeemed')
        .setDescription('This key has already been redeemed and cannot be used again.')
        .setColor(0xff0000)
      ],
      flags: MessageFlags.Ephemeral
    });
  }
  const bannedLines = fs.readFileSync(bannedFile, 'utf-8').split('\n').filter(Boolean);
  if (bannedLines.some(line => line.includes(key))) {
    return interaction.reply({
      embeds: [new EmbedBuilder()
        .setTitle('❌ Banned Key')
        .setDescription('This key has been banned and cannot be redeemed.')
        .setColor(0xff0000)
      ],
      flags: MessageFlags.Ephemeral
    });
  }
  const roleName = keysMap.get(key);
  const vouchers = loadVouchers();
  const voucher = vouchers[key];
  if (roleName === 'VOUCHER' || voucher) {
    const data = voucher || { images: [], note: 'No additional notes' };
    try {
      const dmEmbed = new EmbedBuilder()
        .setColor(0x00ff00)
        .setTitle('🎉 Thank You!')
        .setDescription('Key Redeemed, Thank you for your purchase! Here are your vouchers:')
        .addFields({ name: 'Note', value: data.note || 'No additional notes' });
      await interaction.user.send({ embeds: [dmEmbed] });
      for (const url of data.images || []) {
        await interaction.user.send({ files: [url] });
      }
      addRedeemedKey(key, interaction.user.id, 'VOUCHER');
      if (vouchers[key]) {
        delete vouchers[key];
        saveVouchers(vouchers);
      }
      await interaction.reply({
        embeds: [new EmbedBuilder()
          .setTitle('✅ Voucher Redeemed!')
          .setDescription('Your vouchers have been sent to your DMs!')
          .setColor(0x00ff00)
        ],
        flags: MessageFlags.Ephemeral
      });
    } catch (err) {
      console.error('Voucher DM failed:', err);
      return interaction.reply({
        embeds: [new EmbedBuilder()
          .setTitle('❌ DM Failed')
          .setDescription('Couldn\'t send vouchers to your DMs. Please enable DMs and try again.')
          .setColor(0xff0000)
        ],
        flags: MessageFlags.Ephemeral
      });
    }
    return;
  }
  if (!keysMap.has(key)) {
    return interaction.reply({
      embeds: [new EmbedBuilder()
        .setTitle('❌ Invalid Key')
        .setDescription('The key you entered is invalid or doesn\'t exist.')
        .setColor(0xff0000)
      ],
      flags: MessageFlags.Ephemeral
    });
  }
  const role = guild.roles.cache.find(r => r.name === roleName);
  if (!role) {
    return interaction.reply({
      embeds: [new EmbedBuilder()
        .setTitle('❌ Role Not Found')
        .setDescription(`The role "${roleName}" doesn't exist. Contact admin.`)
        .setColor(0xff0000)
      ],
      flags: MessageFlags.Ephemeral
    });
  }
  try {
    const member = await guild.members.fetch(interaction.user.id);
    await member.roles.add(role);
    addRedeemedKey(key, interaction.user.id, roleName);
    const duration = getRoleDuration(roleName);
    if (duration) {
      let timers = {};
      if (fs.existsSync(timersFile)) {
        timers = JSON.parse(fs.readFileSync(timersFile, 'utf-8') || '{}');
      }
      timers[key] = {
        userId: interaction.user.id,
        roleName: roleName,
        expiresAt: Date.now() + duration
      };
      fs.writeFileSync(timersFile, JSON.stringify(timers, null, 2));

      setTimeout(async () => {
        try {
          const guild = interaction.guild;
          const member = await guild.members.fetch(interaction.user.id);
          const role = guild.roles.cache.find(r => r.name === roleName);
          if (role && member.roles.cache.has(role.id)) {
            await member.roles.remove(role);
            addExpiredKey(key, roleName, interaction.user.tag);
            await interaction.user.send({
              embeds: [new EmbedBuilder()
                .setTitle('⏰ Role Expired')
                .setDescription(`Your "${roleName}" role has expired.`)
                .setColor(0xff9900)
              ]
            });
          }
          let timers = JSON.parse(fs.readFileSync(timersFile, 'utf-8') || '{}');
          delete timers[key];
          fs.writeFileSync(timersFile, JSON.stringify(timers, null, 2));
        } catch (e) {
          console.error('Error removing role:', e);
        }
      }, duration);
    }
    await interaction.reply({
      embeds: [new EmbedBuilder()
        .setTitle('✅ Role Redeemed!')
        .setDescription(`You now have the **${roleName}** role!`)
        .setColor(0x00ff00)
      ],
      flags: MessageFlags.Ephemeral
    });
  } catch (err) {
    console.error('Role assignment error:', err);
    return interaction.reply({
      embeds: [new EmbedBuilder()
        .setTitle('❌ Error')
        .setDescription('Failed to assign role. Contact admin.')
        .setColor(0xff0000)
      ],
      flags: MessageFlags.Ephemeral
    });
  }
}

async function handleShopModal(interaction) {
  const productName = interaction.fields.getTextInputValue('product_name');
  const budget = interaction.fields.getTextInputValue('budget');
  const details = interaction.fields.getTextInputValue('details');
  const fullName = interaction.fields.getTextInputValue('full_name');
  const billingInfo = interaction.fields.getTextInputValue('billing');
  const orderId = `ORD-${Date.now().toString(36).toUpperCase()}`;
  const order = {
    userId: interaction.user.id,
    userName: interaction.user.tag,
    productName,
    budget,
    details,
    fullName,
    billingInfo,
    status: 'Pending Review',
    submittedAt: DateTime.now().toFormat('yyyy-MM-dd HH:mm'),
    lastUpdate: DateTime.now().toFormat('yyyy-MM-dd HH:mm')
  };
  orderTracking.set(orderId, order);
  const userEmbed = new EmbedBuilder()
    .setTitle('Order Submitted Successfully')
    .setDescription(`Your order has been submitted for review.\n\n**Order ID:** ${orderId}\n\nUse this ID to track your order status.`)
    .setColor(randColour())
    .addFields(
      { name: 'Product', value: productName, inline: true },
      { name: 'Budget', value: budget, inline: true },
      { name: 'Status', value: order.status, inline: false }
    );
  await interaction.reply({ embeds: [userEmbed], ephemeral: true });
  const adminEmbed = new EmbedBuilder()
    .setTitle('New Order Submission')
    .setDescription(`**Order ID:** ${orderId}`)
    .setColor(randColour())
    .setTimestamp()
    .addFields(
      { name: 'Customer', value: `${interaction.user} (${interaction.user.id})`, inline: false },
      { name: 'Product', value: productName, inline: true },
      { name: 'Budget', value: budget, inline: true },
      { name: 'Details', value: details, inline: false },
      { name: 'Full Name', value: fullName, inline: true },
      { name: 'Billing Info', value: billingInfo, inline: false }
    );
  const reviewButtons = createReviewView(orderId);
  const channel = client.channels.cache.get(ORDERS_CHANNEL_ID);
  if (channel) {
    const msg = await channel.send({ content: `<@&${ADMIN_ROLE_ID}> New order!`, embeds: [adminEmbed], components: [reviewButtons] });
    orderMessageMap.set(orderId, msg.id);
  }
}

async function handleOrderTracking(interaction, orderId) {
  if (!orderTracking.has(orderId)) {
    const embed = new EmbedBuilder()
      .setTitle('Order Not Found')
      .setDescription(`No order found with ID: ${orderId}`)
      .setColor(randColour());
    return await interaction.reply({ embeds: [embed], ephemeral: true });
  }
  const order = orderTracking.get(orderId);
  const embed = new EmbedBuilder()
    .setTitle(`Order Status: ${orderId}`)
    .setDescription(`Current Status: **${order.status}**`)
    .setColor(randColour())
    .addFields(
      { name: 'Product', value: order.productName, inline: true },
      { name: 'Budget', value: order.budget, inline: true },
      { name: 'Submitted', value: order.submittedAt, inline: true },
      { name: 'Last Update', value: order.lastUpdate, inline: true }
    );
  if (order.trackingNumber) {
    embed.addFields({ name: 'Tracking Number', value: order.trackingNumber, inline: false });
  }
  if (order.estimatedDelivery) {
    embed.addFields({ name: 'Estimated Delivery', value: order.estimatedDelivery, inline: true });
  }
  await interaction.reply({ embeds: [embed], ephemeral: true });
}

async function handleOrderApproval(interaction, orderId, reason) {
  if (!orderTracking.has(orderId)) {
    return await interaction.reply({ content: 'Order not found.', ephemeral: true });
  }
  const order = orderTracking.get(orderId);
  order.status = 'Approved - Awaiting Payment';
  order.lastUpdate = DateTime.now().toFormat('yyyy-MM-dd HH:mm');
  order.approvedAt = DateTime.now().toFormat('yyyy-MM-dd HH:mm');
  order.approvedBy = interaction.user.tag;
  order.staffNote = reason;
  orderTracking.set(orderId, order);
  const userEmbed = new EmbedBuilder()
    .setTitle('Order Approved!')
    .setDescription(`Your order ${orderId} has been approved!\n\nPlease proceed with payment.`)
    .setColor(randColour())
    .addFields(
      { name: 'Product', value: order.productName, inline: true },
      { name: 'Budget', value: order.budget, inline: true }
    );
  if (reason) {
    userEmbed.addFields({ name: 'Note from Staff', value: reason, inline: false });
  }
  const paymentButtons = createPaymentConfirmView(orderId);
  try {
    const user = await client.users.fetch(order.userId);
    await user.send({ embeds: [userEmbed], components: [paymentButtons] });
  } catch (error) {
    console.error(`Failed to DM user about approval:`, error);
  }
  await interaction.reply({ content: `Order ${orderId} has been approved.`, ephemeral: true });
  const messageId = orderMessageMap.get(orderId);
  if (messageId) {
    try {
      const channel = client.channels.cache.get(ORDERS_CHANNEL_ID);
      const message = await channel.messages.fetch(messageId);
      const updatedEmbed = EmbedBuilder.from(message.embeds[0])
        .setColor(0x00FF00)
        .addFields({ name: 'Status', value: '✅ Approved', inline: false });
      if (reason) {
        updatedEmbed.addFields({ name: 'Staff Note', value: reason, inline: false });
      }
      await message.edit({ embeds: [updatedEmbed], components: [] });
    } catch (error) {
      console.error('Failed to update order message:', error);
    }
  }
}

async function handleOrderDenial(interaction, orderId, reason) {
  if (!orderTracking.has(orderId)) {
    return await interaction.reply({ content: 'Order not found.', ephemeral: true });
  }
  const order = orderTracking.get(orderId);
  order.status = 'Denied';
  order.lastUpdate = DateTime.now().toFormat('yyyy-MM-dd HH:mm');
  order.cancellationReason = reason;
  orderTracking.set(orderId, order);
  const userEmbed = new EmbedBuilder()
    .setTitle('Order Denied')
    .setDescription(`Your order ${orderId} has been denied.`)
    .setColor(randColour())
    .addFields({ name: 'Reason', value: reason, inline: false });
  try {
    const user = await client.users.fetch(order.userId);
    await user.send({ embeds: [userEmbed] });
  } catch (error) {
    console.error(`Failed to DM user about denial:`, error);
  }
  await interaction.reply({ content: `Order ${orderId} has been denied.`, ephemeral: true });
  const messageId = orderMessageMap.get(orderId);
  if (messageId) {
    try {
      const channel = client.channels.cache.get(ORDERS_CHANNEL_ID);
      const message = await channel.messages.fetch(messageId);
      const updatedEmbed = EmbedBuilder.from(message.embeds[0])
        .setColor(0xFF0000)
        .addFields(
          { name: 'Status', value: '❌ Denied', inline: false },
          { name: 'Reason', value: reason, inline: false }
        );
      await message.edit({ embeds: [updatedEmbed], components: [] });
    } catch (error) {
      console.error('Failed to update order message:', error);
    }
  }
}

async function handleOrderCancellation(interaction, orderId, reason) {
  if (!orderTracking.has(orderId)) {
    return await interaction.reply({ content: 'Order not found.', ephemeral: true });
  }
  const order = orderTracking.get(orderId);
  order.status = 'Cancelled';
  order.lastUpdate = DateTime.now().toFormat('yyyy-MM-dd HH:mm');
  order.cancellationReason = reason;
  orderTracking.set(orderId, order);
  const confirmEmbed = new EmbedBuilder()
    .setTitle('Order Cancelled')
    .setDescription(`Your order ${orderId} has been cancelled.`)
    .setColor(randColour())
    .addFields({ name: 'Reason', value: reason, inline: false });
  await interaction.reply({ embeds: [confirmEmbed], ephemeral: true });
  const channel = client.channels.cache.get(ORDERS_CHANNEL_ID);
  if (channel) {
    const notifyEmbed = new EmbedBuilder()
      .setTitle('Order Cancelled by Customer')
      .setDescription(`Order ${orderId} was cancelled by ${interaction.user}`)
      .setColor(randColour())
      .addFields({ name: 'Reason', value: reason, inline: false })
      .setTimestamp();
    await channel.send({ embeds: [notifyEmbed] });
  }
}

async function handleTicketModal(interaction) {
  const modalId = interaction.customId;
  let ticketType = '';
  let description = '';
  if (modalId === 'modal_key_reset') {
    ticketType = 'KEY RESET';
    const oldKey = interaction.fields.getTextInputValue('old_key');
    const reason = interaction.fields.getTextInputValue('reason');
    description = `**Old Key:** ${oldKey}\n**Reason:** ${reason}`;
  } else if (modalId === 'modal_contact_us') {
    ticketType = 'CONTACT US';
    const issue = interaction.fields.getTextInputValue('issue');
    description = issue;
  } else if (modalId === 'modal_paypal') {
    ticketType = 'PAYPAL PURCHASE';
    const product = interaction.fields.getTextInputValue('product');
    description = `**Product:** ${product}`;
  }
  try {
    const guild = interaction.guild;
    const category = guild.channels.cache.get(TICKET_CATEGORY_ID);
    const ticketChannel = await guild.channels.create({
      name: `ticket-${interaction.user.username}`,
      type: ChannelType.GuildText,
      parent: category?.id,
      permissionOverwrites: [
        {
          id: guild.id,
          deny: [PermissionsBitField.Flags.ViewChannel]
        },
        {
          id: interaction.user.id,
          allow: [PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.SendMessages]
        },
        ...STAFF_ROLE_IDS.map(roleId => ({
          id: roleId,
          allow: [PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.SendMessages]
        }))
      ]
    });
    const ticketEmbed = new EmbedBuilder()
      .setTitle(`${ticketType} Ticket`)
      .setDescription(description)
      .addFields(
        { name: 'User', value: `${interaction.user}`, inline: true },
        { name: 'User ID', value: interaction.user.id, inline: true }
      )
      .setColor(0xFF0000)
      .setTimestamp();
    const closeButton = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId('close_ticket')
        .setLabel('Close Ticket')
        .setStyle(ButtonStyle.Danger)
    );
    await ticketChannel.send({ content: `${interaction.user} | Staff will be with you shortly.`, embeds: [ticketEmbed], components: [closeButton] });
    await interaction.reply({ content: `Ticket created: ${ticketChannel}`, ephemeral: true });
  } catch (error) {
    console.error('Error creating ticket:', error);
    await interaction.reply({ content: 'Failed to create ticket. Please contact an administrator.', ephemeral: true });
  }
}

async function handleButtonInteraction(interaction) {
  const customId = interaction.customId;
  if (customId === "resell:shop") {
    const modal = new ShopModal();
    await interaction.showModal(modal);
  } else if (customId === "resell:guide") {
    const guideText = ` **How it works** (1) You submit the product / clothing / accessory you want. You will get an order ID. (2) We deny or approve your request with a reason. (3) Once approved, we'll find the best 1:1 from our top vendors, combining low prices with high quality. (4) Once we receive your order (which at most takes up to 1 week), we provide QC pictures. (5) We package your order with physical receipts and ship it to your address. (6) You can keep for personal use or resell. QUICK SUMMARY: vendor ➜ us ➜ you `.trim();
    const embed = new EmbedBuilder()
      .setTitle("Reselling Guide")
      .setDescription(guideText)
      .setColor(randColour());
    await interaction.reply({ embeds: [embed], ephemeral: true });
  } else if (customId === "resell:track") {
    const modal = new OrderLookupModal();
    await interaction.showModal(modal);
  } else if (customId.startsWith("order:track:")) {
    const orderId = customId.split(":")[2];
    await handleOrderTracking(interaction, orderId);
  } else if (customId.startsWith("payment:confirmed:")) {
    const orderId = customId.split(":")[2];
    awaitingPaymentProof.set(interaction.user.id, orderId);
    const instructions = new EmbedBuilder()
      .setTitle("Payment Confirmation")
      .setDescription("Please upload an image of your payment confirmation in this DM.\n\nWe accept screenshots or photos of your payment receipt.")
      .setColor(randColour())
      .setFooter({ text: `Order ID: ${orderId}` });
    await interaction.reply({ embeds: [instructions], ephemeral: true });
  } else if (customId.startsWith("payment:cancel:")) {
    const orderId = customId.split(":")[2];
    const modal = new CancelOrderModal(orderId);
    await interaction.showModal(modal);
  } else if (customId.startsWith("review:approve:")) {
    const orderId = customId.split(":")[2];
    const modal = new ApproveModal(interaction.user.id, orderId);
    await interaction.showModal(modal);
  } else if (customId.startsWith("review:deny:")) {
    const orderId = customId.split(":")[2];
    const modal = new DenyModal(interaction.user.id, orderId);
    await interaction.showModal(modal);
  } else if (customId === 'guide-button') {
    return handleGuideButton(interaction);
  } else if (customId === 'redeem-key') {
    return handleRedeemButton(interaction);
  } else if (customId === 'barcode-guide') {
    return handleBarcodeGuideButton(interaction);
  } else if (customId === 'key_reset') {
    const modal = createKeyResetModal();
    await interaction.showModal(modal);
  } else if (customId === 'contact_us') {
    const modal = createContactUsModal();
    await interaction.showModal(modal);
  } else if (customId === 'paypal') {
    const modal = createPayPalModal();
    await interaction.showModal(modal);
  } else if (customId === 'close_ticket') {
    const confirmRow = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId('confirm_close')
        .setLabel('Confirm Close')
        .setStyle(ButtonStyle.Danger),
      new ButtonBuilder()
        .setCustomId('cancel_close')
        .setLabel('Cancel')
        .setStyle(ButtonStyle.Secondary)
    );
    await interaction.reply({ content: 'Are you sure you want to close this ticket?', components: [confirmRow], ephemeral: true });
  } else if (customId === 'confirm_close') {
    if (interaction.channel) {
      await interaction.update({ content: 'Closing ticket...', components: [] });
      await interaction.channel.delete().catch(err => {
        console.log(`Error deleting channel: ${err}`);
      });
    }
  } else if (customId === 'cancel_close') {
    await interaction.update({ content: 'Ticket close canceled.', components: [] });
  }
}

async function handleModalSubmit(interaction) {
  const customId = interaction.customId;
  if (customId === "shop_modal") {
    await handleShopModal(interaction);
  } else if (customId === "order_lookup_modal") {
    const orderId = interaction.fields.getTextInputValue("order_id").toUpperCase();
    await handleOrderTracking(interaction, orderId);
  } else if (customId.startsWith("cancel_order_modal:")) {
    const orderId = customId.split(":")[1];
    const reason = interaction.fields.getTextInputValue("reason");
    await handleOrderCancellation(interaction, orderId, reason);
  } else if (customId.startsWith("approve_modal:")) {
    const orderId = customId.split(":")[1];
    const reason = interaction.fields.getTextInputValue("reason") || "No reason provided";
    await handleOrderApproval(interaction, orderId, reason);
  } else if (customId.startsWith("deny_modal:")) {
    const orderId = customId.split(":")[1];
    const reason = interaction.fields.getTextInputValue("reason");
    await handleOrderDenial(interaction, orderId, reason);
  } else if (customId === 'redeem-modal') {
    return handleRedeemModal(interaction);
  } else if (customId === 'modal_key_reset') {
    await handleTicketModal(interaction);
  } else if (customId === 'modal_contact_us') {
    await handleTicketModal(interaction);
  } else if (customId === 'modal_paypal') {
    await handleTicketModal(interaction);
  } else if (customId === 'setup-key-select') {
    return handleSetupKeySelect(interaction);
  }
}

async function handleSlashCommand(interaction) {
  const { commandName, options } = interaction;
  if (commandHandlers[commandName]) {
    return commandHandlers[commandName](interaction, options);
  }
}

// ========== SLASH COMMANDS DEFINITION ========== //
const commands = [
  new SlashCommandBuilder()
    .setName('helpm')
    .setDescription('Get help with Morrisons barcode generator'),
  new SlashCommandBuilder()
    .setName('helpc')
    .setDescription('Get help with COOP barcode generator'),
  new SlashCommandBuilder()
    .setName('helps')
    .setDescription('Get help with Sainsburys barcode generator'),
  new SlashCommandBuilder()
    .setName('helpa')
    .setDescription('Get help with ASDA barcode generator'),
  new SlashCommandBuilder()
    .setName('helpw')
    .setDescription('Get help with Waitrose barcode generator'),
  new SlashCommandBuilder()
    .setName('coop')
    .setDescription('Generate a COOP barcode')
    .addStringOption(option =>
      option.setName('barcode')
        .setDescription('13-digit barcode number')
        .setRequired(true))
    .addIntegerOption(option =>
      option.setName('price')
        .setDescription('Price in pence (1-99)')
        .setRequired(true)
        .setMinValue(1)
        .setMaxValue(99))
    .addStringOption(option =>
      option.setName('product')
        .setDescription('Product name')
        .setRequired(true)),
  new SlashCommandBuilder()
    .setName('morrisons')
    .setDescription('Generate a Morrisons barcode')
    .addStringOption(option =>
      option.setName('barcode')
        .setDescription('13-digit barcode number')
        .setRequired(true))
    .addIntegerOption(option =>
      option.setName('price')
        .setDescription('Price in pence (1-99)')
        .setRequired(true)
        .setMinValue(1)
        .setMaxValue(99))
    .addStringOption(option =>
      option.setName('product')
        .setDescription('Product name')
        .setRequired(true)),
  new SlashCommandBuilder()
    .setName('sainsburys')
    .setDescription('Generate a Sainsburys barcode')
    .addStringOption(option =>
      option.setName('barcode')
        .setDescription('13-digit barcode number')
        .setRequired(true))
    .addIntegerOption(option =>
      option.setName('price')
        .setDescription('Price in pence (1-99)')
        .setRequired(true)
        .setMinValue(1)
        .setMaxValue(99))
    .addStringOption(option =>
      option.setName('product')
        .setDescription('Product name')
        .setRequired(true)),
  new SlashCommandBuilder()
    .setName('asda')
    .setDescription('Generate an ASDA barcode')
    .addStringOption(option =>
      option.setName('barcode')
        .setDescription('13-digit barcode number')
        .setRequired(true))
    .addIntegerOption(option =>
      option.setName('price')
        .setDescription('Price in pence (1-99)')
        .setRequired(true)
        .setMinValue(1)
        .setMaxValue(99))
    .addStringOption(option =>
      option.setName('product')
        .setDescription('Product name')
        .setRequired(true)),
  new SlashCommandBuilder()
    .setName('waitrose')
    .setDescription('Generate a Waitrose barcode')
    .addStringOption(option =>
      option.setName('barcode')
        .setDescription('13-digit barcode number')
        .setRequired(true))
    .addIntegerOption(option =>
      option.setName('price')
        .setDescription('Price in pence (1-99)')
        .setRequired(true)
        .setMinValue(1)
        .setMaxValue(99))
    .addStringOption(option =>
      option.setName('product')
        .setDescription('Product name')
        .setRequired(true)),
  new SlashCommandBuilder()
    .setName('picture')
    .setDescription('Submit a success picture')
    .addAttachmentOption(option =>
      option.setName('image')
        .setDescription('Upload your image')
        .setRequired(true))
    .addStringOption(option =>
      option.setName('color')
        .setDescription('Watermark color')
        .setRequired(false)
        .addChoices(
          { name: 'Black', value: 'black' },
          { name: 'White', value: 'white' }
        )),
  new SlashCommandBuilder()
    .setName('reviews')
    .setDescription('Leave a review')
    .addStringOption(option =>
      option.setName('text')
        .setDescription('Your review text')
        .setRequired(true))
    .addIntegerOption(option =>
      option.setName('rating')
        .setDescription('Rating (1-5 stars)')
        .setRequired(true)
        .setMinValue(1)
        .setMaxValue(5)),
  new SlashCommandBuilder()
    .setName('setup')
    .setDescription('Setup the redemption system (Admin only)'),
  new SlashCommandBuilder()
    .setName('addsetupkey')
    .setDescription('Generate a setup key for a role (Admin only)'),
  new SlashCommandBuilder()
    .setName('bankey')
    .setDescription('Ban a key (Admin only)')
    .addStringOption(option =>
      option.setName('key')
        .setDescription('The key to ban')
        .setRequired(true))
    .addStringOption(option =>
      option.setName('reason')
        .setDescription('Reason for banning')
        .setRequired(false)),
  new SlashCommandBuilder()
    .setName('addvoucher')
    .setDescription('Add voucher images (Admin only)')
    .addAttachmentOption(option => option.setName('image1').setDescription('Image 1').setRequired(true))
    .addAttachmentOption(option => option.setName('image2').setDescription('Image 2').setRequired(false))
    .addAttachmentOption(option => option.setName('image3').setDescription('Image 3').setRequired(false))
    .addAttachmentOption(option => option.setName('image4').setDescription('Image 4').setRequired(false))
    .addAttachmentOption(option => option.setName('image5').setDescription('Image 5').setRequired(false))
    .addAttachmentOption(option => option.setName('image6').setDescription('Image 6').setRequired(false))
    .addAttachmentOption(option => option.setName('image7').setDescription('Image 7').setRequired(false))
    .addAttachmentOption(option => option.setName('image8').setDescription('Image 8').setRequired(false))
    .addAttachmentOption(option => option.setName('image9').setDescription('Image 9').setRequired(false))
    .addAttachmentOption(option => option.setName('image10').setDescription('Image 10').setRequired(false))
    .addStringOption(option =>
      option.setName('note')
        .setDescription('Additional note')
        .setRequired(false)),
  new SlashCommandBuilder()
    .setName('logs')
    .setDescription('View key logs (Admin only)'),
  new SlashCommandBuilder()
    .setName('keystatus')
    .setDescription('Check key status (Admin only)'),
  new SlashCommandBuilder()
    .setName('listcommands')
    .setDescription('List all registered commands (Admin only)'),
  new SlashCommandBuilder()
    .setName('setupreselling')
    .setDescription('Setup reselling panel (Admin only)'),
  new SlashCommandBuilder()
    .setName('setupticket')
    .setDescription('Setup ticket system (Admin only)'),
  new SlashCommandBuilder()
    .setName('updateorder')
    .setDescription('Update an order status (Admin only)')
    .addStringOption(option =>
      option.setName('order_id')
        .setDescription('Order ID')
        .setRequired(true))
    .addStringOption(option =>
      option.setName('status')
        .setDescription('New status')
        .setRequired(true))
    .addStringOption(option =>
      option.setName('tracking_number')
        .setDescription('Tracking number')
        .setRequired(false)),
  new SlashCommandBuilder()
    .setName('orderinfo')
    .setDescription('Get order information (Admin only)')
    .addStringOption(option =>
      option.setName('order_id')
        .setDescription('Order ID')
        .setRequired(true))
];

// ========== CLIENT SETUP ========== //
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.DirectMessages,
    GatewayIntentBits.GuildMembers
  ],
  partials: [Partials.Channel, Partials.Message, Partials.Reaction]
});

// ========== CLIENT EVENTS ========== //
client.once(Events.ClientReady, async () => {
  console.log(`Logged in as ${client.user.tag}`);
  loadKeys();
  loadAndRestoreTimers(client);
});

client.on(Events.MessageCreate, async message => {
  if (
    message.channel.id === COOP_CHANNEL_ID ||
    message.channel.id === MORRISONS_CHANNEL_ID ||
    message.channel.id === SAINSBURYS_CHANNEL_ID ||
    message.channel.id === ASDA_CHANNEL_ID ||
    message.channel.id === WAITROSE_CHANNEL_ID
  ) {
    if (message.author.bot || message.interaction) return;
    try { await message.delete(); } catch (err) { console.error('Failed to delete user message:', err); }
  }
  if (message.channel.type === 1 && !message.author.bot) {
    if (awaitingPaymentProof.has(message.author.id)) {
      const orderId = awaitingPaymentProof.get(message.author.id);
      const imageAttachments = message.attachments.filter(attachment => attachment.contentType && attachment.contentType.startsWith('image/'));
      if (imageAttachments.size > 0) {
        const order = orderTracking.get(orderId);
        order.status = "Payment Proof Submitted";
        order.lastUpdate = DateTime.now().toFormat('yyyy-MM-dd HH:mm');
        orderTracking.set(orderId, order);
        const paymentEmbed = new EmbedBuilder()
          .setTitle("💰 Payment Confirmation Received")
          .setDescription(`**Order ID:** ${orderId}`)
          .setColor(randColour())
          .setTimestamp()
          .addFields(
            { name: "Customer", value: `${message.author} (${message.author.id})`, inline: false },
            { name: "Status", value: "Payment proof submitted - awaiting verification", inline: false }
          );
        const channel = client.channels.cache.get(ORDERS_CHANNEL_ID);
        if (channel) {
          const pingMessage = `<@&${ADMIN_ROLE_ID}> Payment confirmation received!`;
          await channel.send({ content: pingMessage, embeds: [paymentEmbed] });
          for (const [, attachment] of imageAttachments) {
            const imageEmbed = new EmbedBuilder()
              .setTitle(`Payment Proof for Order ${orderId}`)
              .setColor(randColour())
              .setImage(attachment.url);
            await channel.send({ embeds: [imageEmbed] });
          }
        }
        awaitingPaymentProof.delete(message.author.id);
        const confirmEmbed = new EmbedBuilder()
          .setTitle("✅ Payment Proof Received!")
          .setDescription("We've received your payment confirmation image(s). Our team will verify and proceed with your order.")
          .setColor(randColour())
          .setFooter({ text: "Thank you for your purchase!" });
        await message.channel.send({ embeds: [confirmEmbed] });
      } else {
        const reminderEmbed = new EmbedBuilder()
          .setTitle("Payment Proof Required")
          .setDescription("Please upload one or more images of your payment confirmation. We accept screenshots or photos of your payment receipt.")
          .setColor(randColour())
          .setFooter({ text: `Order ID: ${orderId}` });
        await message.channel.send({ embeds: [reminderEmbed] });
      }
    }
  }
});

client.on(Events.InteractionCreate, async interaction => {
  try {
    if (interaction.isButton()) {
      await handleButtonInteraction(interaction);
    } else if (interaction.isModalSubmit()) {
      await handleModalSubmit(interaction);
    } else if (interaction.isChatInputCommand()) {
      await handleSlashCommand(interaction);
    } else if (interaction.isStringSelectMenu()) {
      if (interaction.customId === 'setup-key-select') {
        return handleSetupKeySelect(interaction);
      }
    }
  } catch (error) {
    console.error('❌ Interaction error:', error);
    if (!interaction.replied && !interaction.deferred) {
      await interaction.reply({ content: 'An error occurred while processing this command.', ephemeral: true }).catch(console.error);
    } else if (interaction.deferred) {
      await interaction.editReply({ content: 'An error occurred while processing this command.' }).catch(console.error);
    }
  }
});

// ========== REGISTER SLASH COMMANDS & LOGIN ========== //
(async () => {
  try {
    console.log('Registering slash commands...');
    console.log('BOT_TOKEN:', TOKEN ? 'Loaded' : 'Missing');
    console.log('CLIENT_ID:', CLIENT_ID);
    console.log('GUILD_ID:', GUILD_ID);
    
    const rest = new REST({ version: '10' }).setToken(TOKEN);
    let retries = 3;
    while (retries > 0) {
      try {
        const result = await rest.put(
          Routes.applicationGuildCommands(CLIENT_ID, GUILD_ID),
          { body: commands }
        );
        console.log('✅ Slash commands registered:', Array.isArray(result) ? result.length : result);
        break;
      } catch (err) {
        retries--;
        if (retries <= 0) {
          console.error('❌ Error registering commands:', err);
          break;
        }
        console.log(`Retrying... (${retries} attempts left)`);
        await new Promise(resolve => setTimeout(resolve, 5000));
      }
    }
  } catch (err) {
    console.error('❌ Error registering commands:', err);
  }
  
  // Login after commands are registered
  client.login(TOKEN);
})();import {
  Client, GatewayIntentBits, Partials, EmbedBuilder, ActionRowBuilder,
  ButtonBuilder, ButtonStyle, ModalBuilder, TextInputBuilder, TextInputStyle,
  Events, REST, Routes, SlashCommandBuilder, PermissionsBitField, ChannelType,
  AttachmentBuilder, StringSelectMenuBuilder, MessageFlags
} from 'discord.js';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import dotenv from 'dotenv';
import { randomInt } from 'crypto';
import bwipjs from 'bwip-js';
import { createCanvas, loadImage } from 'canvas';
import fs from 'fs';
import https from 'https';
import { DateTime } from 'luxon';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
dotenv.config({ path: join(__dirname, '.env') });

// ========== ENVIRONMENT VARIABLES ========== //
const TOKEN = process.env.TOKEN || 'MTQzOTYxNjIyOTA4OTM0OTc1Ng.Glusv8.QHIlOmk9DnpqiG1nC9PkzvSm8k5xN6nR5j3qHA';
const CLIENT_ID = process.env.CLIENT_ID || '1439616229089349756';
const GUILD_ID = process.env.GUILD_ID || '1422847992385376328';
const ADMIN_ROLE_ID = process.env.ADMIN_ROLE_ID;
const COOP_CHANNEL_ID = process.env.COOP_CHANNEL_ID;
const MORRISONS_CHANNEL_ID = process.env.MORRISONS_CHANNEL_ID || '1424843707462713364';
const SAINSBURYS_CHANNEL_ID = process.env.SAINSBURYS_CHANNEL_ID || '1424833110981349449';
const ASDA_CHANNEL_ID = process.env.ASDA_CHANNEL_ID || '1424468746793123962';
const WAITROSE_CHANNEL_ID = process.env.WAITROSE_CHANNEL_ID || '1424844189283385344';
const PICTURES_CHANNEL = process.env.PICTURES_CHANNEL;
const REVIEWS_CHANNEL = process.env.REVIEWS_CHANNEL;
const ORDERS_CHANNEL_ID = process.env.ORDERS_CHANNEL_ID;
const PRESIDENT_ROLE_ID = process.env.PRESIDENT_ROLE_ID;
const LEAD_ADMIN_ROLE_ID = process.env.LEAD_ADMIN_ROLE_ID;
const CONTACT_URL = process.env.CONTACT_URL;
const TICKET_CATEGORY_ID = process.env.TICKET_CATEGORY_ID;
const STAFF_ROLE_IDS = process.env.STAFF_ROLE_IDS ? process.env.STAFF_ROLE_IDS.split(',') : [];
const ADMIN_USER_ID = process.env.ADMIN_USER_ID;
const LOGS_CHANNEL_ID = process.env.LOGS_CHANNEL_ID;

// Store Role IDs
const MORRISONS_ROLE_ID = process.env.MORRISONS_ROLE_ID || '1423795845228396574';
const ASDA_ROLE_ID = process.env.ASDA_ROLE_ID || '1423795812797911050';
const SAINSBURYS_ROLE_ID = process.env.SAINSBURYS_ROLE_ID || '1423795787610980424';
const WAITROSE_ROLE_ID = process.env.WAITROSE_ROLE_ID || '1423795760717365389';

// ========== CONSTANTS ========== //
const STAR_EMOJI = '<:star:1400148683835703357>';
const LIVE_EMOJI = '<a:live:1410600670372827156>';
const BABY_BLUE = 0x89CFF0;
const MORRISONS_GREEN = 0x007A33;
const ORANGE = 0xf47738;
const BARCODE_WIDTH = 800;
const BARCODE_HEIGHT = 190;
const BARCODE_Y = 720;
const PRICE_Y = 450;
const PRODUCT_NAME_Y = 580;

// ========== FILE PATHS ========== //
const TEMPLATES_DIR = '/home/container/templates';
const REDEEM_DIR = '/home/container/redeem';
const BLACK_WATERMARK_PATH = join(TEMPLATES_DIR, 'blackwatermark.png');
const WHITE_WATERMARK_PATH = join(TEMPLATES_DIR, 'whitewatermark.png');
const COOP_TEMPLATE = join(TEMPLATES_DIR, 'cooptemplate.png');
const MORRISONS_TEMPLATE = join(TEMPLATES_DIR, 'morrisonstemplate.png');
const SAINSBURYS_TEMPLATE = join(TEMPLATES_DIR, 'sainsburystemplate.png');
const ASDA_TEMPLATE = join(TEMPLATES_DIR, 'asdatemplate.png');
const WAITROSE_TEMPLATE = join(TEMPLATES_DIR, 'waitrosetemplate.png');
const keysFile = join(REDEEM_DIR, 'keys.txt');
const logsFile = join(REDEEM_DIR, 'logs.txt');
const bannedFile = join(REDEEM_DIR, 'bannedKeys.txt');
const unbannedFile = join(REDEEM_DIR, 'unbannedKeys.txt');
const redeemedFile = join(REDEEM_DIR, 'redeemedKeys.txt');
const unusedFile = join(REDEEM_DIR, 'unusedKeys.txt');
const expiredFile = join(REDEEM_DIR, 'expiredKeys.txt');
const timersFile = join(REDEEM_DIR, 'keyTimers.json');
const vouchersFile = join(REDEEM_DIR, 'vouchers.json');

// Ensure directories and files exist
[TEMPLATES_DIR, REDEEM_DIR].forEach(dir => {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
});
[logsFile, bannedFile, unbannedFile, redeemedFile, unusedFile, expiredFile, timersFile, vouchersFile].forEach(file => {
  if (!fs.existsSync(file)) fs.writeFileSync(file, '');
});

// ========== UTILITY FUNCTIONS ========== //
function randColour() { return randomInt(0xFFFFFF); }
function getRandomColor() { return Math.floor(Math.random() * 16777215); }
function padLeft(str, length) { return str.toString().padStart(length, '0'); }
function maskUsername(username) {
  if (!username || username.length === 0) return '******';
  const firstChar = username.charAt(0);
  const options = ["*****", "******", "*******", "********", "*********", "**********"];
  const stars = options[Math.floor(Math.random() * options.length)];
  return firstChar + stars;
}
function formatDate(date) {
  const day = String(date.getDate()).padStart(2, '0');
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const year = date.getFullYear();
  return `${day}/${month}/${year}`;
}
function generateSetupKey() {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  const part = () => Array.from({ length: 3 }, () => chars[Math.floor(Math.random() * chars.length)]).join('');
  return `VCH-${part()}-${part()}-${part()}`;
}
function generateVoucherKey() {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  const part = () => Array.from({ length: 4 }, () => chars[Math.floor(Math.random() * chars.length)]).join('');
  return `VCH-${part()}-${part()}-${part()}`;
}
function luhn_checksum(code) {
  let len = code.length;
  let parity = len % 2;
  let sum = 0;
  for (let i = len - 1; i >= 0; i--) {
    let d = parseInt(code.charAt(i));
    if (i % 2 == parity) d *= 2;
    if (d > 9) d -= 9;
    sum += d;
  }
  return sum % 10;
}
function luhn_calculate(partcode) {
  let checksum = luhn_checksum(partcode + "0");
  return checksum === 0 ? 0 : 10 - checksum;
}
function luhn_validate(fullcode) { return luhn_checksum(fullcode) === 0; }
function completeNumber(partcode) { return partcode + luhn_calculate(partcode); }
function calculateCheckDigit(input) {
  let sum = 0;
  for (let i = 0; i < input.length; i++) {
    const digit = parseInt(input[input.length - 1 - i], 10);
    const weight = (i % 2 === 0) ? 3 : 1;
    sum += digit * weight;
  }
  return (10 - (sum % 10)) % 10;
}
async function fetchImageBuffer(url) {
  return new Promise((resolve, reject) => {
    https.get(url, res => {
      if (res.statusCode !== 200) return reject(new Error(`Failed to fetch image: ${res.statusCode}`));
      const data = [];
      res.on('data', chunk => data.push(chunk));
      res.on('end', () => resolve(Buffer.concat(data)));
    }).on('error', reject);
  });
}
async function applyWatermark(originalBuffer, watermarkColor = 'black') {
  try {
    const watermarkPath = watermarkColor === 'white' ? WHITE_WATERMARK_PATH : BLACK_WATERMARK_PATH;
    if (!fs.existsSync(watermarkPath)) {
      console.warn(`Watermark file not found: ${watermarkPath}`);
      return originalBuffer;
    }
    const [originalImage, watermarkImage] = await Promise.all([
      loadImage(originalBuffer),
      loadImage(watermarkPath)
    ]);
    const canvas = createCanvas(originalImage.width, originalImage.height);
    const ctx = canvas.getContext('2d');
    ctx.drawImage(originalImage, 0, 0);
    const watermarkWidth = originalImage.width * 0.90;
    const watermarkHeight = (watermarkImage.height * watermarkWidth) / watermarkImage.width;
    const x = (originalImage.width - watermarkWidth) / 2;
    const y = (originalImage.height - watermarkHeight) / 2;
    ctx.globalAlpha = 0.7;
    ctx.drawImage(watermarkImage, x, y, watermarkWidth, watermarkHeight);
    ctx.globalAlpha = 1.0;
    return canvas.toBuffer('image/jpeg', { quality: 0.95 });
  } catch (err) {
    console.error('Watermark application failed:', err);
    return originalBuffer;
  }
}
async function dmUser(userId, embed, components = []) {
  try {
    const user = await client.users.fetch(userId);
    await user.send({ embeds: [embed], components });
    return true;
  } catch (err) {
    console.error(`Failed to DM user ${userId}:`, err);
    return false;
  }
}
async function isAdmin(interaction) {
  if (!ADMIN_ROLE_ID) return false;
  try {
    const member = await interaction.guild.members.fetch(interaction.user.id);
    return member.roles.cache.has(ADMIN_ROLE_ID);
  } catch { return false; }
}

// ========== REDEEM SYSTEM ========== //
const keysMap = new Map();
const redeemedKeys = new Set();

function loadKeys() {
  keysMap.clear();
  redeemedKeys.clear();
  if (fs.existsSync(keysFile)) {
    const lines = fs.readFileSync(keysFile, 'utf-8').split('\n').filter(Boolean);
    for (const line of lines) {
      const match = line.match(/^(.+?)\s*=\s*["'](.+?)["']$/);
      if (match) keysMap.set(match[1], match[2]);
    }
  }
  if (fs.existsSync(redeemedFile)) {
    const redeemedLines = fs.readFileSync(redeemedFile, 'utf-8').split('\n').filter(Boolean);
    for (const line of redeemedLines) {
      const match = line.match(/^(.+?)\s*=/);
      if (match) redeemedKeys.add(match[1]);
    }
  }
}

function loadVouchers() {
  try { return JSON.parse(fs.readFileSync(vouchersFile, 'utf-8') || '{}'); }
  catch { return {}; }
}

function saveVouchers(obj) { fs.writeFileSync(vouchersFile, JSON.stringify(obj, null, 2)); }

function logKeyAction(action, key, roleName = '-', userTag = 'System', reason = '-') {
  const timestamp = new Date().toISOString();
  const line = `[${timestamp}] ${action} - Key: "${key}" | Role: "${roleName}" | By: ${userTag} | Reason: ${reason}\n`;
  fs.appendFileSync(logsFile, line);
  if (LOGS_CHANNEL_ID) {
    const logChannel = client.channels.cache.get(LOGS_CHANNEL_ID);
    if (logChannel?.isTextBased()) {
      const embed = new EmbedBuilder()
        .setTitle(`🔑 ${action}`)
        .setColor(action.includes('Added') ? 0x00FF00 : action.includes('Redeemed') ? 0x0000FF : 0xFF0000)
        .addFields(
          { name: 'Key', value: `\`${key}\``, inline: true },
          { name: 'Role', value: roleName, inline: true },
          { name: 'By', value: userTag, inline: true }
        )
        .setTimestamp();
      if (reason !== '-') embed.addFields({ name: 'Reason', value: reason });
      logChannel.send({ embeds: [embed] }).catch(console.error);
    }
  }
}

function saveKey(key, roleName, userTag = 'System') {
  const line = `${key} = "${roleName}"\n`;
  fs.appendFileSync(keysFile, line);
  fs.appendFileSync(unusedFile, line);
  keysMap.set(key, roleName);
  logKeyAction('Key Added', key, roleName, userTag);
}

function addBannedKey(key, roleName, userTag, reason = '-') {
  const line = `${key} = "${roleName}" | Reason: "${reason}"\n`;
  fs.appendFileSync(bannedFile, line);
  if (fs.existsSync(unusedFile)) {
    let unusedLines = fs.readFileSync(unusedFile, 'utf-8').split('\n').filter(Boolean);
    unusedLines = unusedLines.filter(line => !line.includes(key));
    fs.writeFileSync(unusedFile, unusedLines.join('\n') + (unusedLines.length > 0 ? '\n' : ''));
  }
  logKeyAction('Key Banned', key, roleName, userTag, reason);
}

function addRedeemedKey(key, userId, roleName) {
  const line = `${key} = "${userId}" | "${roleName}"\n`;
  fs.appendFileSync(redeemedFile, line);
  redeemedKeys.add(key);
  if (fs.existsSync(unusedFile)) {
    let unusedLines = fs.readFileSync(unusedFile, 'utf-8').split('\n').filter(Boolean);
    unusedLines = unusedLines.filter(line => !line.includes(key));
    fs.writeFileSync(unusedFile, unusedLines.join('\n') + (unusedLines.length > 0 ? '\n' : ''));
  }
  logKeyAction('Key Redeemed', key, roleName, userId);
}

function addExpiredKey(key, roleName, userTag) {
  const line = `${key} = "${roleName}" | By: ${userTag}\n`;
  fs.appendFileSync(expiredFile, line);
  logKeyAction('Key Expired', key, roleName, userTag);
}

function getRoleDuration(roleName) {
  const r = (roleName || '').toLowerCase();
  if (r.includes('lifetime')) return null;
  if (r.includes('7d')) return 7 * 24 * 60 * 60 * 1000;
  if (r.includes('3d')) return 3 * 24 * 60 * 60 * 1000;
  if (r.includes('1d')) return 1 * 24 * 60 * 60 * 1000;
  return null;
}

// ========== TIMER MANAGEMENT ========== //
function loadAndRestoreTimers(client) {
  if (!fs.existsSync(timersFile)) return;
  const timers = JSON.parse(fs.readFileSync(timersFile, 'utf-8') || '{}');
  const now = Date.now();
  Object.entries(timers).forEach(async ([key, timer]) => {
    const timeLeft = timer.expiresAt - now;
    if (timeLeft <= 0) {
      try {
        const guild = client.guilds.cache.get(GUILD_ID);
        if (!guild) return;
        const member = await guild.members.fetch(timer.userId);
        const role = guild.roles.cache.find(r => r.name === timer.roleName);
        if (role && member.roles.cache.has(role.id)) {
          await member.roles.remove(role);
          addExpiredKey(key, timer.roleName, timer.userId);
          await client.users.fetch(timer.userId).then(user => {
            user.send({
              embeds: [new EmbedBuilder()
                .setTitle('⏰ Role Expired')
                .setDescription(`Your "${timer.roleName}" role has expired.`)
                .setColor(0xff9900)
              ]
            }).catch(console.error);
          });
        }
        delete timers[key];
        fs.writeFileSync(timersFile, JSON.stringify(timers, null, 2));
      } catch (e) {
        console.error('Error restoring timer:', e);
      }
    } else {
      setTimeout(async () => {
        try {
          const guild = client.guilds.cache.get(GUILD_ID);
          if (!guild) return;
          const member = await guild.members.fetch(timer.userId);
          const role = guild.roles.cache.find(r => r.name === timer.roleName);
          if (role && member.roles.cache.has(role.id)) {
            await member.roles.remove(role);
            addExpiredKey(key, timer.roleName, timer.userId);
            await client.users.fetch(timer.userId).then(user => {
              user.send({
                embeds: [new EmbedBuilder()
                  .setTitle('⏰ Role Expired')
                  .setDescription(`Your "${timer.roleName}" role has expired.`)
                  .setColor(0xff9900)
                ]
              }).catch(console.error);
            });
          }
          delete timers[key];
          fs.writeFileSync(timersFile, JSON.stringify(timers, null, 2));
        } catch (e) {
          console.error('Error removing role:', e);
        }
      }, timeLeft);
    }
  });
}

// ========== ORDER TRACKING ========== //
const orderTracking = new Map();
const orderMessageMap = new Map();
const awaitingPaymentProof = new Map();

// ========== MODAL BUILDERS ========== //
class ShopModal {
  constructor() {
    return new ModalBuilder()
      .setCustomId('shop_modal')
      .setTitle('Submit Purchase Request')
      .addComponents(
        new ActionRowBuilder().addComponents(
          new TextInputBuilder()
            .setCustomId('product_name')
            .setLabel('Product Name')
            .setStyle(TextInputStyle.Short)
            .setRequired(true)
        ),
        new ActionRowBuilder().addComponents(
          new TextInputBuilder()
            .setCustomId('budget')
            .setLabel('Budget (e.g. $50-$100)')
            .setStyle(TextInputStyle.Short)
            .setRequired(true)
        ),
        new ActionRowBuilder().addComponents(
          new TextInputBuilder()
            .setCustomId('details')
            .setLabel('Details (size, color, etc.)')
            .setStyle(TextInputStyle.Paragraph)
            .setRequired(true)
        ),
        new ActionRowBuilder().addComponents(
          new TextInputBuilder()
            .setCustomId('full_name')
            .setLabel('Full Name')
            .setStyle(TextInputStyle.Short)
            .setRequired(true)
        ),
        new ActionRowBuilder().addComponents(
          new TextInputBuilder()
            .setCustomId('billing')
            .setLabel('Billing Information')
            .setStyle(TextInputStyle.Paragraph)
            .setRequired(true)
        )
      );
  }
}

class OrderLookupModal {
  constructor() {
    return new ModalBuilder()
      .setCustomId('order_lookup_modal')
      .setTitle('Track Your Order')
      .addComponents(
        new ActionRowBuilder().addComponents(
          new TextInputBuilder()
            .setCustomId('order_id')
            .setLabel('Order ID')
            .setStyle(TextInputStyle.Short)
            .setRequired(true)
        )
      );
  }
}

class CancelOrderModal {
  constructor(orderId) {
    return new ModalBuilder()
      .setCustomId(`cancel_order_modal:${orderId}`)
      .setTitle('Cancel Order')
      .addComponents(
        new ActionRowBuilder().addComponents(
          new TextInputBuilder()
            .setCustomId('reason')
            .setLabel('Reason for cancellation')
            .setStyle(TextInputStyle.Paragraph)
            .setRequired(true)
        )
      );
  }
}

class ApproveModal {
  constructor(userId, orderId) {
    return new ModalBuilder()
      .setCustomId(`approve_modal:${orderId}`)
      .setTitle('Approve Order')
      .addComponents(
        new ActionRowBuilder().addComponents(
          new TextInputBuilder()
            .setCustomId('reason')
            .setLabel('Reason (optional)')
            .setStyle(TextInputStyle.Paragraph)
            .setRequired(false)
        )
      );
  }
}

class DenyModal {
  constructor(userId, orderId) {
    return new ModalBuilder()
      .setCustomId(`deny_modal:${orderId}`)
      .setTitle('Deny Order')
      .addComponents(
        new ActionRowBuilder().addComponents(
          new TextInputBuilder()
            .setCustomId('reason')
            .setLabel('Reason for denial')
            .setStyle(TextInputStyle.Paragraph)
            .setRequired(true)
        )
      );
  }
}

class PublicPanel {
  constructor() {
    return new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId('resell:shop')
        .setLabel('Shop Now')
        .setStyle(ButtonStyle.Secondary)
        .setEmoji(LIVE_EMOJI),
      new ButtonBuilder()
        .setCustomId('resell:guide')
        .setLabel('Guide')
        .setStyle(ButtonStyle.Secondary)
        .setEmoji(LIVE_EMOJI),
      new ButtonBuilder()
        .setCustomId('resell:track')
        .setLabel('Track Order')
        .setStyle(ButtonStyle.Secondary)
        .setEmoji(LIVE_EMOJI)
    );
  }
}

function createReviewView(orderId) {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`review:approve:${orderId}`)
      .setLabel('Approve')
      .setStyle(ButtonStyle.Success),
    new ButtonBuilder()
      .setCustomId(`review:deny:${orderId}`)
      .setLabel('Deny')
      .setStyle(ButtonStyle.Danger)
  );
}

function createPaymentConfirmView(orderId) {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`payment:confirmed:${orderId}`)
      .setLabel('Payment Confirmed')
      .setStyle(ButtonStyle.Success),
    new ButtonBuilder()
      .setCustomId(`payment:cancel:${orderId}`)
      .setLabel('Cancel Order')
      .setStyle(ButtonStyle.Danger)
  );
}

function createKeyResetModal() {
  return new ModalBuilder()
    .setCustomId('modal_key_reset')
    .setTitle('Key Reset Request')
    .addComponents(
      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId('old_key')
          .setLabel('What was your old key?')
          .setStyle(TextInputStyle.Short)
          .setRequired(true)
      ),
      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId('reason')
          .setLabel('Reason you need a new key?')
          .setStyle(TextInputStyle.Paragraph)
          .setRequired(true)
      )
    );
}

function createContactUsModal() {
  return new ModalBuilder()
    .setCustomId('modal_contact_us')
    .setTitle('Contact Us')
    .addComponents(
      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId('issue')
          .setLabel('What is the issue or question?')
          .setStyle(TextInputStyle.Paragraph)
          .setRequired(true)
      )
    );
}

function createPayPalModal() {
  return new ModalBuilder()
    .setCustomId('modal_paypal')
    .setTitle('PayPal Purchase')
    .addComponents(
      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId('product')
          .setLabel('Name of Product you wish to buy?')
          .setStyle(TextInputStyle.Short)
          .setRequired(true)
      )
    );
}

// ========== COMMAND HANDLERS ========== //
const commandHandlers = {
  'helpm': async (interaction) => {
    const helpEmbed = new EmbedBuilder()
      .setColor(getRandomColor())
      .setTitle('Morrisons Barcode Generator Help')
      .setDescription('**How to use the Morrisons barcode generator:**\n\n' +
        '1. Use /morrisons command\n' +
        '2. Enter your barcode digits (13 digit number under barcode)\n' +
        '3. Enter price between 1-99 (£0.01-£0.99)\n' +
        '4. Enter product name\n' +
        'Example: /morrisons barcode:1920423453332 price:5 product:Milk\n' +
        'The barcodes will be sent to your DMs.');
    await interaction.reply({ embeds: [helpEmbed], flags: MessageFlags.Ephemeral });
  },
  'helpc': async (interaction) => {
    const helpEmbed = new EmbedBuilder()
      .setColor(getRandomColor())
      .setTitle('COOP Barcode Generator Help')
      .setDescription('**How to use the COOP barcode generator:**\n' +
        '1. Use /coop command\n' +
        '2. Enter your barcode digits (13 digit number under barcode)\n' +
        '3. Enter price between 1-99 (£0.01-£0.99)\n' +
        '4. Enter product name\n' +
        'Example: /coop barcode:1920423453332 price:99 product:Bread\n' +
        'The barcodes will be sent to your DMs.');
    await interaction.reply({ embeds: [helpEmbed], flags: MessageFlags.Ephemeral });
  },
  'helps': async (interaction) => {
    const helpEmbed = new EmbedBuilder()
      .setColor(getRandomColor())
      .setTitle('Sainsburys Barcode Generator Help')
      .setDescription('**How to use the Sainsburys barcode generator:**\n' +
        '1. Use /sainsburys command\n' +
        '2. Enter your barcode digits (13 digit number under barcode)\n' +
        '3. Enter price between 1-99 (£0.01-£0.99)\n' +
        '4. Enter product name\n' +
        'Example: /sainsburys barcode:1920423453332 price:50 product:Eggs\n' +
        'The barcodes will be sent to your DMs.');
    await interaction.reply({ embeds: [helpEmbed], flags: MessageFlags.Ephemeral });
  },
  'helpa': async (interaction) => {
    const helpEmbed = new EmbedBuilder()
      .setColor(getRandomColor())
      .setTitle('ASDA Barcode Generator Help')
      .setDescription('**How to use the ASDA barcode generator:**\n' +
        '1. Use /asda command\n' +
        '2. Enter your barcode digits (13 digit number under barcode)\n' +
        '3. Enter price between 1-99 (£0.01-£0.99)\n' +
        '4. Enter product name\n' +
        'Example: /asda barcode:19204332 price:5 product:Milk\n' +
        'The bot will automatically format your barcode according to ASDA specifications.');
    await interaction.reply({ embeds: [helpEmbed], flags: MessageFlags.Ephemeral });
  },
  'helpw': async (interaction) => {
    const helpEmbed = new EmbedBuilder()
      .setColor(getRandomColor())
      .setTitle('Waitrose Barcode Generator Help')
      .setDescription('**How to use the Waitrose barcode generator:**\n\n' +
        '1. Use /waitrose command\n' +
        '2. Enter your barcode digits (13 digit number under barcode)\n' +
        '3. Enter price between 1-99 (£0.01-£0.99)\n' +
        '4. Enter product name\n' +
        'Example: /waitrose barcode:1920423453332 price:50 product:Milk\n' +
        'The barcodes will be sent to your DMs.');
    await interaction.reply({ embeds: [helpEmbed], flags: MessageFlags.Ephemeral });
  },
  'coop': async (interaction) => {
    if (interaction.channelId !== COOP_CHANNEL_ID) {
      return interaction.reply({ content: '❌ Use this command in the COOP channel only.', flags: MessageFlags.Ephemeral });
    }
    const barcodeInput = interaction.options.getString('barcode');
    const priceInput = interaction.options.getInteger('price');
    const productName = interaction.options.getString('product');
    if (!barcodeInput || !priceInput || isNaN(priceInput) || priceInput < 1 || priceInput > 99 || !productName) {
      return interaction.reply({
        embeds: [new EmbedBuilder()
          .setColor(getRandomColor())
          .setDescription('⚠️ Invalid format. Use **/coop <barcode> <price (1-99)> <product>**')
        ],
        flags: MessageFlags.Ephemeral
      });
    }
    try {
      await interaction.deferReply({ flags: MessageFlags.Ephemeral });
      let cleaned = barcodeInput.replace(/\D/g, '');
      if (cleaned.length > 13) cleaned = cleaned.slice(0, 13);
      else if (cleaned.length < 13) cleaned = cleaned.padStart(13, '0');
      const baseNumber = cleaned.substring(0, 12);
      let checkDigit = calculateCheckDigit(baseNumber);
      const fullBarcode = `${baseNumber}${checkDigit}`;
      const barcodeBuffer = await bwipjs.toBuffer({
        bcid: 'ean13',
        text: fullBarcode,
        scale: 3,
        height: 10,
      });
      const template = await loadImage(COOP_TEMPLATE);
      const barcodeImage = await loadImage(barcodeBuffer);
      const canvas = createCanvas(template.width, template.height);
      const ctx = canvas.getContext('2d');
      ctx.drawImage(template, 0, 0);
      const barcodeX = (canvas.width - BARCODE_WIDTH) / 2;
      ctx.drawImage(barcodeImage, barcodeX, BARCODE_Y, BARCODE_WIDTH, BARCODE_HEIGHT);
      ctx.fillStyle = '#000';
      ctx.font = 'bold 85px Arial';
      const priceText = `£${(priceInput / 100).toFixed(2)}`;
      const priceX = (canvas.width - ctx.measureText(priceText).width) / 2;
      ctx.fillText(priceText, priceX, PRICE_Y);
      ctx.font = '90px Arial';
      const nameX = (canvas.width - ctx.measureText(productName).width) / 2;
      ctx.fillText(productName, nameX, PRODUCT_NAME_Y);
      const finalBuffer = canvas.toBuffer('image/png');
      const attachment = new AttachmentBuilder(finalBuffer, { name: 'coop-barcode.png' });
      const guideButton = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId('barcode-guide')
          .setLabel('GUIDE')
          .setStyle(ButtonStyle.Secondary)
          .setEmoji('<a:whiteuzi:1410660851618152529>')
      );
      const dmEmbed = new EmbedBuilder()
        .setColor(getRandomColor())
        .setTitle(`YOUR BARCODE IS READY! ${LIVE_EMOJI}`)
        .setFooter({ text: '𝗣𝗥𝗜𝗩𝗔𝗧𝗘 & 𝗦𝗘𝗖𝗨𝗥𝗘 — Property of LEOPARD MARKET only you can see/use this. Do not Share' });
      try {
        await interaction.user.send({ embeds: [dmEmbed], files: [attachment], components: [guideButton] });
        await interaction.editReply({ content: '✅ Your COOP barcode has been sent to your DMs.' });
      } catch (err) {
        return interaction.editReply({
          embeds: [new EmbedBuilder()
            .setColor(getRandomColor())
            .setDescription('❌ I couldn\'t DM you the barcode. Please enable DMs from server members.')
          ]
        });
      }
      const maskedUser = maskUsername(interaction.user.username);
      const logEmbed = new EmbedBuilder()
        .setColor(getRandomColor())
        .setTitle(`SUCCESS ${LIVE_EMOJI}`)
        .setDescription(`${maskedUser} generated a **£${(priceInput / 100).toFixed(2)}** COOP barcode for **${productName}**`);
      const logChannel = await client.channels.fetch(COOP_CHANNEL_ID);
      if (logChannel?.isTextBased()) logChannel.send({ embeds: [logEmbed] });
    } catch (err) {
      console.error(err);
      return interaction.editReply({
        embeds: [new EmbedBuilder()
          .setColor(getRandomColor())
          .setDescription('❌ An error occurred while generating your barcode.')
        ]
      });
    }
  },
  'morrisons': async (interaction) => {
    if (interaction.channelId !== MORRISONS_CHANNEL_ID) {
      return interaction.reply({ content: '❌ Use this command in the Morrisons channel only.', flags: MessageFlags.Ephemeral });
    }
    const barcodeInput = interaction.options.getString('barcode');
    const priceInput = interaction.options.getInteger('price');
    const productName = interaction.options.getString('product');
    if (!barcodeInput || !priceInput || isNaN(priceInput) || priceInput < 1 || priceInput > 99 || !productName) {
      return interaction.reply({
        embeds: [new EmbedBuilder()
          .setColor(getRandomColor())
          .setDescription('⚠️ Invalid format. Use **/morrisons <barcode> <price (1-99)> <product>**')
        ],
        flags: MessageFlags.Ephemeral
      });
    }
    try {
      await interaction.deferReply({ flags: MessageFlags.Ephemeral });
      let cleaned = barcodeInput.replace(/\D/g, '');
      if (cleaned.length > 13) cleaned = cleaned.slice(0, 13);
      else if (cleaned.length < 13) cleaned = cleaned.padStart(13, '0');
      const middleSegment = `00003${priceInput}00027`;
      const fullBarcode = `92${cleaned}${middleSegment}`;
      const barcodeBuffer = await bwipjs.toBuffer({
        bcid: 'code128',
        text: fullBarcode,
        scale: 3,
        height: 12,
        includetext: false
      });
      const template = await loadImage(MORRISONS_TEMPLATE);
      const barcodeImage = await loadImage(barcodeBuffer);
      const canvas = createCanvas(template.width, template.height);
      const ctx = canvas.getContext('2d');
      ctx.drawImage(template, 0, 0);
      const barcodeX = (canvas.width - BARCODE_WIDTH) / 2;
      ctx.drawImage(barcodeImage, barcodeX, BARCODE_Y, BARCODE_WIDTH, BARCODE_HEIGHT);
      ctx.fillStyle = '#000';
      ctx.font = 'bold 85px Arial';
      const priceText = `£${(priceInput / 100).toFixed(2)}`;
      const priceX = (canvas.width - ctx.measureText(priceText).width) / 2;
      ctx.fillText(priceText, priceX, PRICE_Y);
      ctx.font = '90px Arial';
      const nameX = (canvas.width - ctx.measureText(productName).width) / 2;
      ctx.fillText(productName, nameX, PRODUCT_NAME_Y);
      const finalBuffer = canvas.toBuffer('image/png');
      const attachment = new AttachmentBuilder(finalBuffer, { name: 'morrisons-barcode.png' });
      const guideButton = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId('barcode-guide')
          .setLabel('GUIDE')
          .setStyle(ButtonStyle.Secondary)
          .setEmoji('<a:whiteuzi:1410660851618152529>')
      );
      const dmEmbed = new EmbedBuilder()
        .setColor(getRandomColor())
        .setTitle(`YOUR MORRISONS BARCODE IS READY! ${LIVE_EMOJI}`)
        .setFooter({ text: '𝗣𝗥𝗜𝗩𝗔𝗧𝗘 & 𝗦𝗘𝗖𝗨𝗥𝗘 — Property of LEOPARD MARKET only you can see/use this. Do not Share' });
      try {
        await interaction.user.send({ embeds: [dmEmbed], files: [attachment], components: [guideButton] });
        await interaction.editReply({ content: '✅ Your Morrisons barcode has been sent to your DMs.' });
      } catch (err) {
        return interaction.editReply({
          embeds: [new EmbedBuilder()
            .setColor(getRandomColor())
            .setDescription('❌ I couldn\'t DM you the barcode. Please enable DMs from server members.')
          ]
        });
      }
      const maskedUser = maskUsername(interaction.user.username);
      const logEmbed = new EmbedBuilder()
        .setColor(getRandomColor())
        .setTitle(`SUCCESS ${LIVE_EMOJI}`)
        .setDescription(`${maskedUser} generated a **£${(priceInput / 100).toFixed(2)}** Morrisons barcode for **${productName}**`);
      const logChannel = await client.channels.fetch(MORRISONS_CHANNEL_ID);
      if (logChannel?.isTextBased()) logChannel.send({ embeds: [logEmbed] });
    } catch (err) {
      console.error(err);
      return interaction.editReply({
        embeds: [new EmbedBuilder()
          .setColor(getRandomColor())
          .setDescription('❌ An error occurred while generating your barcode.')
        ]
      });
    }
  },
  'sainsburys': async (interaction) => {
    if (interaction.channelId !== SAINSBURYS_CHANNEL_ID) {
      return interaction.reply({ content: '❌ Use this command in the Sainsburys channel only.', flags: MessageFlags.Ephemeral });
    }
    const barcodeInput = interaction.options.getString('barcode');
    const priceInput = interaction.options.getInteger('price');
    const productName = interaction.options.getString('product');
    if (!barcodeInput || !priceInput || isNaN(priceInput) || priceInput < 1 || priceInput > 99 || !productName) {
      return interaction.reply({
        embeds: [new EmbedBuilder()
          .setColor(getRandomColor())
          .setDescription('⚠️ Invalid format. Use **/sainsburys <barcode> <price (1-99)> <product>**')
        ],
        flags: MessageFlags.Ephemeral
      });
    }
    try {
      await interaction.deferReply({ flags: MessageFlags.Ephemeral });
      let cleaned = barcodeInput.replace(/\D/g, '');
      if (cleaned.length > 13) cleaned = cleaned.slice(0, 13);
      else if (cleaned.length < 13) cleaned = cleaned.padStart(13, '0');
      const paddedPrice = padLeft(priceInput, 6);
      const baseNumber = `91${cleaned}${paddedPrice}`;
      let checkDigit = calculateCheckDigit(baseNumber);
      const fullBarcode = `${baseNumber}${checkDigit}`;
      const barcodeBuffer = await bwipjs.toBuffer({
        bcid: 'code128',
        text: fullBarcode,
        scale: 3,
        height: 12,
        includetext: false
      });
      const template = await loadImage(SAINSBURYS_TEMPLATE);
      const barcodeImage = await loadImage(barcodeBuffer);
      const canvas = createCanvas(template.width, template.height);
      const ctx = canvas.getContext('2d');
      ctx.drawImage(template, 0, 0);
      const barcodeX = (canvas.width - BARCODE_WIDTH) / 2;
      const sainsburysBarcodeY = 650;
      ctx.drawImage(barcodeImage, barcodeX, sainsburysBarcodeY, BARCODE_WIDTH, BARCODE_HEIGHT);
      ctx.fillStyle = '#000';
      ctx.font = '90px Arial';
      const nameX = (canvas.width - ctx.measureText(productName).width) / 2;
      ctx.fillText(productName, nameX, PRODUCT_NAME_Y);
      const finalBuffer = canvas.toBuffer('image/png');
      const attachment = new AttachmentBuilder(finalBuffer, { name: 'sainsbury-barcode.png' });
      const guideButton = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId('barcode-guide')
          .setLabel('GUIDE')
          .setStyle(ButtonStyle.Secondary)
          .setEmoji('<a:whiteuzi:1410660851618152529>')
      );
      const dmEmbed = new EmbedBuilder()
        .setColor(getRandomColor())
        .setTitle(`YOUR SAINSBURYS BARCODE IS READY! ${LIVE_EMOJI}`)
        .setFooter({ text: '𝗣𝗥𝗜𝗩𝗔𝗧𝗘 & 𝗦𝗘𝗖𝗨𝗥𝗘 — Property of LEOPARD MARKET only you can see/use this. Do not Share' });
      try {
        await interaction.user.send({ embeds: [dmEmbed], files: [attachment], components: [guideButton] });
        await interaction.editReply({ content: '✅ Your Sainsburys barcode has been sent to your DMs.', flags: MessageFlags.Ephemeral });
      } catch (err) {
        return interaction.editReply({
          embeds: [new EmbedBuilder()
            .setColor(getRandomColor())
            .setDescription('❌ I couldn\'t DM you the barcode. Please enable DMs from server members.')
          ]
        });
      }
      const maskedUser = maskUsername(interaction.user.username);
      const logEmbed = new EmbedBuilder()
        .setColor(getRandomColor())
        .setTitle(`SUCCESS ${LIVE_EMOJI}`)
        .setDescription(`${maskedUser} generated a **£${(priceInput / 100).toFixed(2)}** Sainsburys barcode for **${productName}**`);
      const logChannel = await client.channels.fetch(SAINSBURYS_CHANNEL_ID);
      if (logChannel?.isTextBased()) logChannel.send({ embeds: [logEmbed] });
    } catch (err) {
      console.error(err);
      return interaction.editReply({
        embeds: [new EmbedBuilder()
          .setColor(getRandomColor())
          .setDescription('❌ An error occurred while generating your barcode.')
        ]
      });
    }
  },
  'asda': async (interaction) => {
    if (interaction.channelId !== ASDA_CHANNEL_ID) {
      return interaction.reply({ content: '❌ Use this command in the ASDA channel only.', flags: MessageFlags.Ephemeral });
    }
    const barcodeInput = interaction.options.getString('barcode');
    const priceInput = interaction.options.getInteger('price');
    const productName = interaction.options.getString('product');
    if (!barcodeInput || !priceInput || isNaN(priceInput) || priceInput < 1 || priceInput > 99 || !productName) {
      return interaction.reply({
        embeds: [new EmbedBuilder()
          .setColor(getRandomColor())
          .setDescription('⚠️ Invalid format. Use **/asda <barcode> <price (1-99)> <product>**')
        ],
        flags: MessageFlags.Ephemeral
      });
    }
    try {
      await interaction.deferReply({ flags: MessageFlags.Ephemeral });
      let cleaned = barcodeInput.replace(/\D/g, '');
      if (cleaned.length > 13) cleaned = cleaned.slice(0, 13);
      else if (cleaned.length < 13) cleaned = cleaned.padStart(13, '0');
      const paddedPrice = padLeft(priceInput, 2);
      const baseBarcode = `330${cleaned}000${paddedPrice}2056`;
      const checkDigit = luhn_calculate(baseBarcode);
      const fullBarcode = `${baseBarcode}${checkDigit}`;
      const barcodeBuffer = await bwipjs.toBuffer({
        bcid: 'code128',
        text: fullBarcode,
        scale: 3,
        height: 12,
        includetext: false
      });
      const template = await loadImage(ASDA_TEMPLATE);
      const barcodeImage = await loadImage(barcodeBuffer);
      const canvas = createCanvas(template.width, template.height);
      const ctx = canvas.getContext('2d');
      ctx.drawImage(template, 0, 0);
      const barcodeX = (canvas.width - BARCODE_WIDTH) / 2;
      ctx.drawImage(barcodeImage, barcodeX, BARCODE_Y, BARCODE_WIDTH, BARCODE_HEIGHT);
      ctx.fillStyle = '#000';
      ctx.font = 'bold 85px Arial';
      const priceText = `£${(priceInput / 100).toFixed(2)}`;
      const priceX = (canvas.width - ctx.measureText(priceText).width) / 2;
      ctx.fillText(priceText, priceX, PRICE_Y);
      ctx.font = '90px Arial';
      const nameX = (canvas.width - ctx.measureText(productName).width) / 2;
      ctx.fillText(productName, nameX, PRODUCT_NAME_Y);
      const finalBuffer = canvas.toBuffer('image/png');
      const attachment = new AttachmentBuilder(finalBuffer, { name: 'asda-barcode.png' });
      const guideButton = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId('barcode-guide')
          .setLabel('GUIDE')
          .setStyle(ButtonStyle.Secondary)
          .setEmoji('<a:whiteuzi:1410660851618152529>')
      );
      const dmEmbed = new EmbedBuilder()
        .setColor(getRandomColor())
        .setTitle(`YOUR ASDA BARCODE IS READY! ${LIVE_EMOJI}`)
        .setFooter({ text: '𝗣𝗥𝗜𝗩𝗔𝗧𝗘 & 𝗦𝗘𝗖𝗨𝗥𝗘 — Property of LEOPARD MARKET only you can see/use this. Do not Share' });
      try {
        await interaction.user.send({ embeds: [dmEmbed], files: [attachment], components: [guideButton] });
        await interaction.editReply({ content: '✅ Your ASDA barcode has been sent to your DMs.', flags: MessageFlags.Ephemeral });
      } catch (err) {
        return interaction.editReply({
          embeds: [new EmbedBuilder()
            .setColor(getRandomColor())
            .setDescription('❌ I couldn\'t DM you the barcode. Please enable DMs from server members.')
          ]
        });
      }
      const maskedUser = maskUsername(interaction.user.username);
      const logEmbed = new EmbedBuilder()
        .setColor(getRandomColor())
        .setTitle(`SUCCESS ${LIVE_EMOJI}`)
        .setDescription(`${maskedUser} generated a **£${(priceInput / 100).toFixed(2)}** ASDA barcode for **${productName}**`);
      const logChannel = await client.channels.fetch(ASDA_CHANNEL_ID);
      if (logChannel?.isTextBased()) logChannel.send({ embeds: [logEmbed] });
    } catch (err) {
      console.error(err);
      return interaction.editReply({
        embeds: [new EmbedBuilder()
          .setColor(getRandomColor())
          .setDescription('❌ An error occurred while generating your barcode.')
        ]
      });
    }
  },
  'waitrose': async (interaction) => {
    if (interaction.channelId !== WAITROSE_CHANNEL_ID) {
      return interaction.reply({ content: '❌ Use this command in the Waitrose channel only.', flags: MessageFlags.Ephemeral });
    }
    const barcodeInput = interaction.options.getString('barcode');
    const priceInput = interaction.options.getInteger('price');
    const productName = interaction.options.getString('product');
    if (!barcodeInput || !priceInput || isNaN(priceInput) || priceInput < 1 || priceInput > 99 || !productName) {
      return interaction.reply({
        embeds: [new EmbedBuilder()
          .setColor(getRandomColor())
          .setDescription('⚠️ Invalid format. Use **/waitrose <barcode> <price (1-99)> <product>**')
        ],
        flags: MessageFlags.Ephemeral
      });
    }
    try {
      await interaction.deferReply({ flags: MessageFlags.Ephemeral });
      let cleaned = barcodeInput.replace(/\D/g, '');
      if (cleaned.length > 13) cleaned = cleaned.slice(0, 13);
      else if (cleaned.length < 13) cleaned = cleaned.padStart(13, '0');
      const baseNumber = cleaned.substring(0, 12);
      let checkDigit = calculateCheckDigit(baseNumber);
      const fullBarcode = `${baseNumber}${checkDigit}`;
      const barcodeBuffer = await bwipjs.toBuffer({
        bcid: 'ean13',
        text: fullBarcode,
        scale: 3,
        height: 10,
      });
      const template = await loadImage(WAITROSE_TEMPLATE);
      const barcodeImage = await loadImage(barcodeBuffer);
      const canvas = createCanvas(template.width, template.height);
      const ctx = canvas.getContext('2d');
      ctx.drawImage(template, 0, 0);
      const barcodeX = (canvas.width - BARCODE_WIDTH) / 2;
      ctx.drawImage(barcodeImage, barcodeX, BARCODE_Y, BARCODE_WIDTH, BARCODE_HEIGHT);
      ctx.fillStyle = '#000';
      ctx.font = 'bold 85px Arial';
      const priceText = `£${(priceInput / 100).toFixed(2)}`;
      const priceX = (canvas.width - ctx.measureText(priceText).width) / 2;
      ctx.fillText(priceText, priceX, PRICE_Y);
      ctx.font = '90px Arial';
      const nameX = (canvas.width - ctx.measureText(productName).width) / 2;
      ctx.fillText(productName, nameX, PRODUCT_NAME_Y);
      const finalBuffer = canvas.toBuffer('image/png');
      const attachment = new AttachmentBuilder(finalBuffer, { name: 'waitrose-barcode.png' });
      const guideButton = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId('barcode-guide')
          .setLabel('GUIDE')
          .setStyle(ButtonStyle.Secondary)
          .setEmoji('<a:whiteuzi:1410660851618152529>')
      );
      const dmEmbed = new EmbedBuilder()
        .setColor(getRandomColor())
        .setTitle(`YOUR WAITROSE BARCODE IS READY! ${LIVE_EMOJI}`)
        .setFooter({ text: '𝗣𝗥𝗜𝗩𝗔𝗧𝗘 & 𝗦𝗘𝗖𝗨𝗥𝗘 — Property of LEOPARD MARKET only you can see/use this. Do not Share' });
      try {
        await interaction.user.send({ embeds: [dmEmbed], files: [attachment], components: [guideButton] });
        await interaction.editReply({ content: '✅ Your Waitrose barcode has been sent to your DMs.' });
      } catch (err) {
        return interaction.editReply({
          embeds: [new EmbedBuilder()
            .setColor(getRandomColor())
            .setDescription('❌ I couldn\'t DM you the barcode. Please enable DMs from server members.')
          ]
        });
      }
      const maskedUser = maskUsername(interaction.user.username);
      const logEmbed = new EmbedBuilder()
        .setColor(getRandomColor())
        .setTitle(`SUCCESS ${LIVE_EMOJI}`)
        .setDescription(`${maskedUser} generated a **£${(priceInput / 100).toFixed(2)}** Waitrose barcode for **${productName}**`);
      const logChannel = await client.channels.fetch(WAITROSE_CHANNEL_ID);
      if (logChannel?.isTextBased()) logChannel.send({ embeds: [logEmbed] });
    } catch (err) {
      console.error(err);
      return interaction.editReply({
        embeds: [new EmbedBuilder()
          .setColor(getRandomColor())
          .setDescription('❌ An error occurred while generating your barcode.')
        ]
      });
    }
  },
  'picture': async (interaction) => {
    const image = interaction.options.getAttachment('image');
    const watermarkColor = interaction.options.getString('color') || 'black';
    if (!image.contentType || !image.contentType.startsWith('image/')) {
      return interaction.reply({ content: '❌ Please upload a valid image file.', flags: MessageFlags.Ephemeral });
    }
    try {
      const channel = await client.channels.fetch(PICTURES_CHANNEL);
      if (!channel) throw new Error('Pictures channel not found');
      const maskedUsername = maskUsername(interaction.user.username);
      const embed = new EmbedBuilder()
        .setTitle(`${maskedUsername} sent a success picture ${LIVE_EMOJI}`)
        .setColor(getRandomColor());
      let finalAttachment;
      try {
        const imageBuffer = await fetchImageBuffer(image.url);
        const watermarkPath = watermarkColor === 'white' ? WHITE_WATERMARK_PATH : BLACK_WATERMARK_PATH;
        if (fs.existsSync(watermarkPath)) {
          const watermarkedBuffer = await applyWatermark(imageBuffer, watermarkColor);
          finalAttachment = new AttachmentBuilder(watermarkedBuffer, { name: 'success.jpg' });
          embed.setImage('attachment://success.jpg');
        } else {
          console.warn(`Watermark file not found: ${watermarkPath}`);
          finalAttachment = new AttachmentBuilder(imageBuffer, { name: 'success.jpg' });
          embed.setImage('attachment://success.jpg');
        }
      } catch (err) {
        console.error('Image processing error:', err);
        embed.setImage(image.url);
      }
      if (finalAttachment) {
        await channel.send({ embeds: [embed], files: [finalAttachment] });
      } else {
        await channel.send({ embeds: [embed] });
      }
      await interaction.reply({ content: '✅ Your picture has been submitted!', flags: MessageFlags.Ephemeral });
    } catch (err) {
      console.error('Picture submission error:', err);
      await interaction.reply({ content: '❌ An error occurred while submitting your picture.', flags: MessageFlags.Ephemeral });
    }
  },
  'reviews': async (interaction) => {
    const text = interaction.options.getString('text');
    const rating = interaction.options.getInteger('rating');
    if (text.length < 10) {
      return interaction.reply({ content: '❌ Review must be at least 10 characters long.', flags: MessageFlags.Ephemeral });
    }
    try {
      const channel = await client.channels.fetch(REVIEWS_CHANNEL);
      if (!channel) throw new Error('Reviews channel not found');
      const maskedUsername = maskUsername(interaction.user.username);
      const stars = STAR_EMOJI.repeat(rating);
      const currentDate = formatDate(new Date());
      const embed = new EmbedBuilder()
        .setTitle(`${maskedUsername} left feedback ${LIVE_EMOJI}`)
        .setDescription(`${text}\n\n${stars}\n📅 ${currentDate}`)
        .setColor(getRandomColor());
      await channel.send({ embeds: [embed] });
      await interaction.reply({ content: '✅ Thank you for your review!', flags: MessageFlags.Ephemeral });
    } catch (err) {
      console.error(err);
      await interaction.reply({ content: '❌ An error occurred while submitting your review.', flags: MessageFlags.Ephemeral });
    }
  },
  'setup': async (interaction) => {
    if (!await isAdmin(interaction)) {
      return interaction.reply({ content: '❌ Admin only command', flags: MessageFlags.Ephemeral });
    }
    const embed = new EmbedBuilder()
      .setTitle("LEOPARD KEYS")
      .setDescription(
        '<a:whitefire:1410662139647230017> Instant Access Keys → Get Keys Instantly\n' +
        '<a:whitefire:1410662139647230017> Instant email delivery → Delivered Instantly\n' +
        '<a:whitefire:1410662139647230017> Free key replacements → At no cost\n' +
        'Please fill in the required information. After filling it in you will be given an Order ID to track your order. For more info please read the ***GUIDE***.'
      )
      .setColor(0x000000)
      .setImage('https://cdn.discordapp.com/attachments/1385676404909146270/1410655386129662012/keys.gif?ex=68b1ceb4&is=68b07d34&hm=41f940777b4fc629a52d02d8479e9c3089d35e543daa2271d13959d14bebf1f7&')
      .setFooter({ text: "You won't be left waiting — we reply fast." });
    const buttons = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId('redeem-key')
        .setLabel('Redeem Key')
        .setStyle(ButtonStyle.Secondary)
        .setEmoji('<a:whitefire:1410660851618152529>'),
      new ButtonBuilder()
        .setCustomId('guide-button')
        .setLabel('Guide')
        .setStyle(ButtonStyle.Secondary)
        .setEmoji('<a:whitefire:1410660851618152529>'),
      new ButtonBuilder()
        .setLabel('Buy Key')
        .setStyle(ButtonStyle.Link)
        .setURL('https://leopardmarket.mysellauth.com/')
        .setEmoji('<a:whitefire:1410660851618152529>'),
    );
    await interaction.channel.send({ embeds: [embed], components: [buttons] });
    await interaction.reply({ content: '✅ Redemption system setup complete!', flags: MessageFlags.Ephemeral });
  },
  'addsetupkey': async (interaction) => {
    if (!await isAdmin(interaction)) {
      return interaction.reply({ content: '❌ Admin only command', flags: MessageFlags.Ephemeral });
    }
    const roles = interaction.guild.roles.cache
      .filter(role => role.name.includes('Sainsbury') || role.name.includes('Morrisons') || role.name.includes('Asda') || role.name.includes('Waitrose'))
      .sort((a, b) => a.name.localeCompare(b.name))
      .map(role => ({ label: role.name, value: role.name }));
    if (roles.length === 0) {
      return interaction.reply({
        content: '❌ No valid roles found. Please create roles with "Sainsbury", "Morrisons", "Asda", or "Waitrose" in the name.',
        flags: MessageFlags.Ephemeral
      });
    }
    const selectMenu = new StringSelectMenuBuilder()
      .setCustomId('setup-key-select')
      .setPlaceholder('Select a role for the key')
      .addOptions(roles);
    const row = new ActionRowBuilder().addComponents(selectMenu);
    const embed = new EmbedBuilder()
      .setTitle('🔑 Setup Key Generator')
      .setDescription('Select a role from the dropdown to generate a key for it.')
      .setColor(0x00FF00);
    await interaction.reply({ embeds: [embed], components: [row], flags: MessageFlags.Ephemeral });
  },
  'bankey': async (interaction) => {
    if (!await isAdmin(interaction)) {
      return interaction.reply({ content: '❌ Admin only command', flags: MessageFlags.Ephemeral });
    }
    const key = interaction.options.getString('key');
    const reason = interaction.options.getString('reason') || 'No reason provided';
    const roleName = keysMap.get(key) || 'Unknown role';
    addBannedKey(key, roleName, interaction.user.tag, reason);
    await interaction.reply({
      embeds: [new EmbedBuilder()
        .setTitle('🔑 Key Banned')
        .setDescription(`Key: \`${key}\`\nRole: \`${roleName}\`\nReason: ${reason}`)
        .setColor(0xff0000)
      ],
      flags: MessageFlags.Ephemeral
    });
  },
  'addvoucher': async (interaction) => {
    if (!await isAdmin(interaction)) {
      return interaction.reply({ content: '❌ Admin only command', flags: MessageFlags.Ephemeral });
    }
    const images = [];
    for (let i = 1; i <= 10; i++) {
      const att = interaction.options.getAttachment(`image${i}`);
      if (att) {
        if (!att.contentType || !att.contentType.startsWith('image/')) {
          return interaction.reply({
            embeds: [new EmbedBuilder()
              .setTitle('❌ Invalid File')
              .setDescription(`Attachment \`image${i}\` is not a valid image.`)
              .setColor(0xff0000)
            ],
            flags: MessageFlags.Ephemeral
          });
        }
        images.push(att.url);
      }
    }
    if (images.length === 0) {
      return interaction.reply({ content: '❌ You must attach at least one image.', flags: MessageFlags.Ephemeral });
    }
    const note = interaction.options.getString('note') || 'No additional notes';
    const voucherKey = generateVoucherKey();
    const vouchers = loadVouchers();
    vouchers[voucherKey] = {
      images,
      note,
      addedBy: interaction.user.tag,
      addedAt: new Date().toISOString()
    };
    saveVouchers(vouchers);
    saveKey(voucherKey, 'VOUCHER', interaction.user.tag);
    const responseEmbed = new EmbedBuilder()
      .setTitle('✅ Voucher Added')
      .setDescription(`Voucher Key: \`${voucherKey}\``)
      .addFields(
        { name: 'Note', value: note },
        { name: 'Images', value: `${images.length} image(s) attached` },
        { name: 'Instructions', value: 'Give this key to the customer for redemption' }
      )
      .setImage(images[0])
      .setColor(0x00ff00);
    await interaction.reply({ embeds: [responseEmbed], flags: MessageFlags.Ephemeral });
  },
  'logs': async (interaction) => {
    if (!await isAdmin(interaction)) {
      return interaction.reply({ content: '❌ Admin only command', flags: MessageFlags.Ephemeral });
    }
    try {
      const bannedKeys = fs.existsSync(bannedFile) ? fs.readFileSync(bannedFile, 'utf-8').split('\n').filter(Boolean) : [];
      const redeemedKeys = fs.existsSync(redeemedFile) ? fs.readFileSync(redeemedFile, 'utf-8').split('\n').filter(Boolean) : [];
      const unusedKeys = fs.existsSync(unusedFile) ? fs.readFileSync(unusedFile, 'utf-8').split('\n').filter(Boolean) : [];
      const expiredKeys = fs.existsSync(expiredFile) ? fs.readFileSync(expiredFile, 'utf-8').split('\n').filter(Boolean) : [];
      const bannedEmbed = new EmbedBuilder()
        .setTitle('🚫 BANNED KEYS')
        .setColor(0xFF0000)
        .setDescription(bannedKeys.length > 0 ? bannedKeys.map(k => `\`${k.split('=')[0].trim()}\``).join('\n') : 'No banned keys')
        .setFooter({ text: `Total: ${bannedKeys.length}` });
      const redeemedEmbed = new EmbedBuilder()
        .setTitle('✅ REDEEMED KEYS')
        .setColor(0x0000FF)
        .setDescription(redeemedKeys.length > 0 ? redeemedKeys.map(k => `\`${k.split('=')[0].trim()}\``).join('\n') : 'No redeemed keys')
        .setFooter({ text: `Total: ${redeemedKeys.length}` });
      const unusedEmbed = new EmbedBuilder()
        .setTitle('🆕 UNUSED KEYS')
        .setColor(0x00FF00)
        .setDescription(unusedKeys.length > 0 ? unusedKeys.map(k => `\`${k.split('=')[0].trim()}\``).join('\n') : 'No unused keys')
        .setFooter({ text: `Total: ${unusedKeys.length}` });
      const expiredEmbed = new EmbedBuilder()
        .setTitle('⏰ EXPIRED KEYS')
        .setColor(0xFFFF00)
        .setDescription(expiredKeys.length > 0 ? expiredKeys.map(k => `\`${k.split('=')[0].trim()}\``).join('\n') : 'No expired keys')
        .setFooter({ text: `Total: ${expiredKeys.length}` });
      await interaction.reply({ embeds: [bannedEmbed, redeemedEmbed, unusedEmbed, expiredEmbed], flags: MessageFlags.Ephemeral });
    } catch (error) {
      console.error('Error fetching key status:', error);
      await interaction.reply({ content: '❌ An error occurred while fetching key status.', flags: MessageFlags.Ephemeral });
    }
  },
  'keystatus': async (interaction) => {
    if (!await isAdmin(interaction)) {
      return interaction.reply({ content: '❌ Admin only command', flags: MessageFlags.Ephemeral });
    }
    try {
      const unusedKeys = fs.existsSync(unusedFile) ? fs.readFileSync(unusedFile, 'utf-8').split('\n').filter(Boolean) : [];
      const redeemedKeys = fs.existsSync(redeemedFile) ? fs.readFileSync(redeemedFile, 'utf-8').split('\n').filter(Boolean) : [];
      const bannedKeys = fs.existsSync(bannedFile) ? fs.readFileSync(bannedFile, 'utf-8').split('\n').filter(Boolean) : [];
      const expiredKeys = fs.existsSync(expiredFile) ? fs.readFileSync(expiredFile, 'utf-8').split('\n').filter(Boolean) : [];
      const unusedEmbed = new EmbedBuilder()
        .setTitle('🆕 UNUSED KEYS')
        .setColor(0x00FF00)
        .setDescription(unusedKeys.length > 0 ? unusedKeys.map(k => `\`${k.split('=')[0].trim()}\``).join('\n') : 'No unused keys')
        .setFooter({ text: `Total: ${unusedKeys.length}` });
      const redeemedEmbed = new EmbedBuilder()
        .setTitle('✅ REDEEMED KEYS')
        .setColor(0x0000FF)
        .setDescription(redeemedKeys.length > 0 ? redeemedKeys.map(k => `\`${k.split('=')[0].trim()}\``).join('\n') : 'No redeemed keys')
        .setFooter({ text: `Total: ${redeemedKeys.length}` });
      const bannedEmbed = new EmbedBuilder()
        .setTitle('🚫 BANNED KEYS')
        .setColor(0xFF0000)
        .setDescription(bannedKeys.length > 0 ? bannedKeys.map(k => `\`${k.split('=')[0].trim()}\``).join('\n') : 'No banned keys')
        .setFooter({ text: `Total: ${bannedKeys.length}` });
      const expiredEmbed = new EmbedBuilder()
        .setTitle('⏰ EXPIRED KEYS')
        .setColor(0xFFFF00)
        .setDescription(expiredKeys.length > 0 ? expiredKeys.map(k => `\`${k.split('=')[0].trim()}\``).join('\n') : 'No expired keys')
        .setFooter({ text: `Total: ${expiredKeys.length}` });
      await interaction.reply({ embeds: [unusedEmbed, redeemedEmbed, bannedEmbed, expiredEmbed], flags: MessageFlags.Ephemeral });
    } catch (error) {
      console.error('Error fetching key status:', error);
      await interaction.reply({ content: '❌ An error occurred while fetching key status.', flags: MessageFlags.Ephemeral });
    }
  },
  'listcommands': async (interaction) => {
    if (!await isAdmin(interaction)) {
      return interaction.reply({ content: '❌ Admin only command', flags: MessageFlags.Ephemeral });
    }
    try {
      const rest = new REST({ version: '10' }).setToken(TOKEN);
      const commands = await rest.get(Routes.applicationGuildCommands(CLIENT_ID, GUILD_ID));
      const commandList = commands.map(cmd => `**/${cmd.name}**: ${cmd.description}`).join('\n');
      const embed = new EmbedBuilder()
        .setTitle('📋 Registered Slash Commands')
        .setDescription(commandList || 'No commands registered.')
        .setColor(getRandomColor());
      await interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
    } catch (err) {
      console.error('Error fetching commands:', err);
      await interaction.reply({ content: '❌ An error occurred while fetching commands.', flags: MessageFlags.Ephemeral });
    }
  },
  'setupreselling': async (interaction) => {
    if (!interaction.member.roles.cache.has(ADMIN_ROLE_ID)) {
      const embed = new EmbedBuilder()
        .setTitle("Error")
        .setDescription("You don't have permission to use this command.")
        .setColor(randColour());
      return await interaction.reply({ embeds: [embed], ephemeral: true });
    }
    const embed = new EmbedBuilder()
      .setTitle("LEOPARD BUY")
      .setDescription(
        '<a:blackfire:1410618406671089805> We reply quickly — no long waits.\n' +
        '<a:blackfire:1410618406671089805> Advanced bot-powered data analysis.\n' +
        '<a:blackfire:1410618406671089805> All info is encrypted and automatically deleted once your order is complete.\n' +
        'Please fill in the required information. After filling it in you will be given an Order ID to track your order. For more info please read the ***GUIDE***.'
      )
      .setColor(0x000000)
      .setImage('https://cdn.discordapp.com/attachments/1385676404909146270/1410608489054863421/standard.gif?ex=68b1a307&is=68b05187&hm=dde22d23a9ff61d098e2b0fff902919b8b5b17ea8bd5d7e846e0c5942b6542ff&');
    const view = new PublicPanel();
    await interaction.channel.send({ embeds: [embed], components: [view] });
    const ack = new EmbedBuilder()
      .setTitle("Panel posted")
      .setColor(randColour());
    await interaction.reply({ embeds: [ack], ephemeral: true });
  },
  'setupticket': async (interaction) => {
    if (!interaction.memberPermissions.has(PermissionsBitField.Flags.Administrator)) {
      return interaction.reply({ content: '❌ You need administrator permissions to use this command.', ephemeral: true });
    }
    await interaction.reply({ content: 'Setting up ticket panel...', ephemeral: true });
    const embed = new EmbedBuilder()
      .setTitle('LEOPARD TICKETS')
      .setDescription(
        '<a:redsiren:1411010230627598468> We reply quickly — active support ***24/7***.\n\n' +
        '<a:bloodcredit:1411010237594337291> Fast Easy and Safe PayPal transaction\n\n' +
        '<a:redsiren:1411010230627598468> Keys can only be redeemed once\n\n' +
        'Please fill in the required information in the pop up, also please read ***RULE 7*** before paying with PayPal. Thank You'
      )
      .setImage('https://cdn.discordapp.com/attachments/1385676404909146270/1411010122506833991/standard_1.gif?ex=68b31914&is=68b1c794&hm=3599d492ba73877e62296bfb88a9bca4726641c7428d02d33248757cbc84603b&')
      .setColor(0xFF0000);
    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId('key_reset')
        .setLabel('KEY RESET')
        .setEmoji('1411010232280158209')
        .setStyle(ButtonStyle.Secondary),
      new ButtonBuilder()
        .setCustomId('contact_us')
        .setLabel('CONTACT US')
        .setEmoji('1411010232280158209')
        .setStyle(ButtonStyle.Secondary),
      new ButtonBuilder()
        .setCustomId('paypal')
        .setLabel('PAYPAL')
        .setEmoji('1411010237594337291')
        .setStyle(ButtonStyle.Secondary)
    );
    await interaction.channel.send({ embeds: [embed], components: [row] });
    await interaction.editReply({ content: 'Ticket panel has been set up!', ephemeral: true });
    console.log(`Ticket panel setup by ${interaction.user.tag}`);
  },
  'updateorder': async (interaction, options) => {
    if (!interaction.member.roles.cache.has(ADMIN_ROLE_ID)) {
      const embed = new EmbedBuilder()
        .setTitle("Error")
        .setDescription("You don't have permission to use this command.")
        .setColor(randColour());
      return await interaction.reply({ embeds: [embed], ephemeral: true });
    }
    const orderId = options.getString('order_id').toUpperCase();
    const status = options.getString('status');
    const trackingNumber = options.getString('tracking_number');
    if (!orderTracking.has(orderId)) {
      const embed = new EmbedBuilder()
        .setTitle("Error")
        .setDescription("Order ID not found.")
        .setColor(randColour());
      return await interaction.reply({ embeds: [embed], ephemeral: true });
    }
    const order = orderTracking.get(orderId);
    order.status = status;
    order.lastUpdate = DateTime.now().toFormat('yyyy-MM-dd HH:mm');
    if (trackingNumber) {
      order.trackingNumber = trackingNumber;
      order.estimatedDelivery = DateTime.now().plus({ days: 7 }).toFormat('yyyy-MM-dd');
    }
    orderTracking.set(orderId, order);
    try {
      const user = await client.users.fetch(order.userId);
      const notifyEmbed = new EmbedBuilder()
        .setTitle("Order Status Updated")
        .setDescription(`Your order ${orderId} has been updated.`)
        .setColor(randColour())
        .addFields(
          { name: "New Status", value: status, inline: false },
          { name: "Last Update", value: order.lastUpdate, inline: true }
        );
      if (trackingNumber) {
        notifyEmbed.addFields(
          { name: "Tracking Number", value: trackingNumber, inline: false },
          { name: "Estimated Delivery", value: order.estimatedDelivery || "Not available", inline: true }
        );
      }
      await user.send({ embeds: [notifyEmbed] });
    } catch (error) {
      console.error(`Failed to notify user about order ${orderId}:`, error);
    }
    const channel = client.channels.cache.get(ORDERS_CHANNEL_ID);
    if (channel) {
      const updateEmbed = new EmbedBuilder()
        .setTitle("Order Status Updated")
        .setDescription(`Order ${orderId} has been updated by ${interaction.user}`)
        .setColor(randColour())
        .setTimestamp()
        .addFields(
          { name: "New Status", value: status, inline: false },
          { name: "Updated By", value: `${interaction.user.username}#${interaction.user.discriminator}`, inline: true }
        );
      if (trackingNumber) {
        updateEmbed.addFields({ name: "Tracking Number", value: trackingNumber, inline: false });
      }
      await channel.send({ embeds: [updateEmbed] });
    }
    const embed = new EmbedBuilder()
      .setTitle("Order Updated")
      .setDescription(`Order ${orderId} has been updated to: ${status}`)
      .setColor(randColour());
    await interaction.reply({ embeds: [embed], ephemeral: true });
  },
  'orderinfo': async (interaction, options) => {
    if (!interaction.member.roles.cache.has(ADMIN_ROLE_ID)) {
      const embed = new EmbedBuilder()
        .setTitle("Error")
        .setDescription("You don't have permission to use this command.")
        .setColor(randColour());
      return await interaction.reply({ embeds: [embed], ephemeral: true });
    }
    const orderId = options.getString('order_id').toUpperCase();
    if (!orderTracking.has(orderId)) {
      const embed = new EmbedBuilder()
        .setTitle("Error")
        .setDescription("Order ID not found.")
        .setColor(randColour());
      return await interaction.reply({ embeds: [embed], ephemeral: true });
    }
    const order = orderTracking.get(orderId);
    const embed = new EmbedBuilder()
      .setTitle(`📋 Order Information: ${orderId}`)
      .setColor(randColour())
      .setTimestamp()
      .addFields(
        {
          name: "👤 Customer Information",
          value: `User ID: ${order.userId}\nUsername: ${order.userName}\nFull Name: ${order.fullName}`,
          inline: false
        },
        {
          name: "📦 Order Details",
          value: `Product: ${order.productName}\nBudget: ${order.budget}\nDetails: ${order.details}`,
          inline: false
        },
        { name: "💰 Billing Information", value: order.billingInfo, inline: false }
      );
    let statusInfo = `Status: ${order.status}\nLast Update: ${order.lastUpdate}\nSubmitted: ${order.submittedAt}`;
    if (order.approvedAt) {
      statusInfo += `\nApproved: ${order.approvedAt}\nApproved By: ${order.approvedBy}`;
    }
    if (order.trackingNumber) {
      statusInfo += `\nTracking Number: ${order.trackingNumber}`;
    }
    if (order.estimatedDelivery) {
      statusInfo += `\nEstimated Delivery: ${order.estimatedDelivery}`;
    }
    if (order.staffNote) {
      statusInfo += `\nStaff Note: ${order.staffNote}`;
    }
    if (order.cancellationReason) {
      statusInfo += `\nCancellation Reason: ${order.cancellationReason}`;
    }
    embed.addFields({ name: "📊 Order Status", value: statusInfo, inline: false });
    await interaction.reply({ embeds: [embed], ephemeral: true });
  }
};